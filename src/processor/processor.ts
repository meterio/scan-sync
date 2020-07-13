import { EntityManager, getConnection } from 'typeorm';
import { sleep, InterruptedError, WaitNextTickError } from '../utils';
import { EventEmitter } from 'events';
import { PersistService } from '../service';
import * as logger from '../logger';
import { Block } from '../powergrid-db/entity/block';
import { Transaction } from '../powergrid-db/entity/transaction';
import { Meter } from '../meter-rest';

const SAMPLING_INTERVAL = 1 * 1000;
export class ChainIndicator {
  constructor(num: number, hash: string) {
    this.number = num;
    this.hash = hash;
  }

  number: number;
  hash: string;
}

export enum BlockSource {
  FullNode = 1,
  LocalDB,
}

export abstract class Processor {
  protected head: ChainIndicator = null;
  protected birthNumber: number | null = null;
  private shutdown = false;
  private ev = new EventEmitter();
  private source: BlockSource;
  protected meter: Meter;
  protected persist: PersistService;

  protected manager: EntityManager = null;

  protected get headKey() {
    return '';
  }

  constructor(source: BlockSource, meter?: Meter) {
    this.source = source;
    this.meter = meter;
  }

  public async start() {
    this.manager = getConnection().manager;
    this.persist = new PersistService(this.manager);
    await this.beforeStart();
    this.loop();
    return;
  }

  public stop(): Promise<void> {
    this.shutdown = true;

    return new Promise((resolve) => {
      logger.log('shutting down......');
      this.ev.on('closed', resolve);
    });
  }

  protected abstract bornAt(): Promise<number>;
  protected abstract processBlock(
    block: Block,
    txs: Transaction[],
    manager: EntityManager
  ): Promise<number>;

  protected async getHead(): Promise<ChainIndicator> {
    if (this.head !== null) {
      return this.head;
    } else {
      console.log('HEAD KEY:', this.headKey);
      const head = await this.persist.loadHead(this.headKey);
      return head!;
    }
  }

  protected async saveHead(head: ChainIndicator): Promise<void> {
    if (head !== null) {
      await this.persist.saveHead(this.headKey, head);
    }
    return;
  }

  protected async getRemoteBest(): Promise<ChainIndicator | null> {
    const blk = await this.meter.getBlock('best', 'regular');
    return Promise.resolve(new ChainIndicator(blk.number, blk.id));
  }

  protected async getBest(): Promise<ChainIndicator | null> {
    switch (this.source) {
      case BlockSource.LocalDB:
        return this.persist.getBest();
      case BlockSource.FullNode:
        const blk = await this.meter.getBlock('best', 'regular');
        return Promise.resolve(new ChainIndicator(blk.number, blk.id));
    }
  }

  protected async processGenesis(): Promise<ChainIndicator> {
    return null;
  }

  private async beforeStart() {
    this.birthNumber = await this.bornAt();

    // process genesis
    const h = await this.getHead();
    if (!h) {
      this.head = await this.processGenesis();
      await this.saveHead(this.head);
    }
  }

  private async loop() {
    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);

        const head = await this.getHead();
        const best = await this.getRemoteBest();

        console.log('head: ', head);
        console.log('best: ', best);

        if (!head && !!best) {
          await this.importGenesis();
          await this.batchProcess(0, best.number); // import blocks [0, best]
        } else if (best.number > head.number) {
          // head = await this.getHead();
          await this.batchProcess(head.number, best.number); // import blocks [head+1, best]
        }
      } catch (e) {
        if (e instanceof WaitNextTickError) {
          continue;
        } else if (e instanceof InterruptedError) {
          if (this.shutdown) {
            this.ev.emit('closed');
            break;
          }
        } else {
          logger.error(
            `processor(${this.constructor.name}) loop: ` + (e as Error).stack
          );
          return;
        }
      }
    }
  }

  private async importGenesis() {
    console.log('IMPORT GENESIS');
    const blk = await this.meter.getBlock(0, 'expanded');

    const normalized = this.normalize(blk, null);
    const block = normalized.block;
    const txs = normalized.txs;
    console.log('GENESIS:', block);
    await this.persist.insertBlock(block);
    await this.persist.insertTransaction(txs);
    await this.persist.saveHead(this.headKey, new ChainIndicator(0, block.id));
  }

  private normalize(blk: Meter.ExpandedBlock, prevBlock: Meter.ExpandedBlock) {
    let block: Block;
    let txs: Transaction[] = [];
    let score = 0;
    let gasChanged = 0;
    let reward = BigInt(0);

    if (!!prevBlock) {
      score = blk.totalScore - prevBlock.totalScore;
      gasChanged = blk.gasLimit - prevBlock.gasLimit;
    }

    for (const [index, tx] of blk.transactions.entries()) {
      const clauseCount = tx.clauses ? tx.clauses.length : 0;
      const txPaid = tx.paid ? BigInt(tx.paid) : BigInt(0);
      const txReward = tx.paid ? BigInt(tx.reward) : BigInt(0);
      txs.push({
        txID: tx.id,
        blockID: blk.id,
        seq: {
          blockNumber: blk.number,
          txIndex: index,
        },
        chainTag: tx.chainTag,
        blockRef: tx.blockRef,
        expiration: tx.expiration,
        gasPriceCoef: tx.gasPriceCoef,
        gas: tx.gas,
        nonce: tx.nonce,
        dependsOn: tx.dependsOn,
        origin: tx.origin,
        clauses: tx.clauses,
        clauseCount: clauseCount,
        size: tx.size,
        gasUsed: tx.gasUsed,
        gasPayer: tx.gasPayer,
        paid: txPaid,
        reward: txReward,
        reverted: tx.reverted,
        outputs: tx.outputs,
        // block
        block: null,
      });
      reward += txReward;
    }

    block = {
      ...blk,
      txCount: blk.transactions.length,
      score,
      reward,
      gasChanged,
    };

    if (txs.length > 0) {
      for (let tx of txs) {
        tx.block = block;
      }
    }

    return { block, txs };
  }

  private async batchProcess(startNum: number, endNum: number) {
    let i = startNum + 1;
    console.log(`batch process block : [${i}, ${endNum}]`);
    console.time('time');
    let head = await this.getHead();
    await getConnection().transaction(async (manager) => {
      let batchPersist = new PersistService(manager);
      for (; i <= endNum; i++) {
        if (this.shutdown) {
          break;
        }
        let block: Block;
        let txs: Transaction[];
        switch (this.source) {
          case BlockSource.LocalDB:
            const result = await batchPersist.getExpandedBlockByNumber(i++);
            block = result.block;
            txs = result.txs;
            break;
          case BlockSource.FullNode:
            const blk = await this.meter.getBlock(i, 'expanded');

            let prevBlock: Meter.ExpandedBlock = null;
            if (blk.number > 0) {
              prevBlock = (await this.meter.getBlock(
                blk.parentID,
                'expanded'
              ))!;
            }
            const normalized = this.normalize(blk, prevBlock);
            block = normalized.block;
            txs = normalized.txs;
        }

        // only process block that extend head
        if (block.number === head.number + 1 && block.parentID === head.hash) {
          await this.processBlock(block!, txs, manager);
          head = new ChainIndicator(block.number, block.id);
          this.head = head;
          await this.saveHead(head);
          process.stdout.write(`imported block(${i}) ${block.id} `);
          console.timeEnd('time');
          console.time('time');
        }
      }
    });
  }
}
