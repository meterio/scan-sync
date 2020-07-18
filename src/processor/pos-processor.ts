import { EntityManager, getConnection } from 'typeorm';
import { sleep, InterruptedError, WaitNextTickError } from '../utils';
import { EventEmitter } from 'events';
import { PersistService } from '../service';
import * as logger from '../logger';
import { Block } from '../powergrid-db/entity/block';
import { Transaction } from '../powergrid-db/entity/transaction';
import { Meter } from '../meter-rest';
import { Processor } from './processor';

const SAMPLING_INTERVAL = 500;
export class ChainIndicator {
  constructor(num: number, hash: string) {
    this.number = num;
    this.hash = hash;
  }

  number: number;
  hash: string;
  public toString = (): string => {
    return `(${this.number}) ${this.hash}`;
  };
}

export enum BlockSource {
  FullNode = 1,
  LocalDB,
}

export abstract class PosProcessor extends Processor {
  private shutdown = false;
  private ev = new EventEmitter();

  protected headKey = 'pos-process-head';
  protected source = BlockSource.LocalDB;
  protected head: ChainIndicator = null;
  protected birthNumber: number | null = null;
  protected meter: Meter;
  protected persist: PersistService;
  protected manager: EntityManager = null;

  constructor(headKey: string, source: BlockSource, meter?: Meter) {
    super();
    this.headKey = headKey;
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

  protected async getLocalBest(): Promise<ChainIndicator | null> {
    return this.persist.getBest();
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

  private async beforeStart() {
    console.log('');
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
        console.log('-'.repeat(80));

        const head = await this.getHead();
        let best = await this.getRemoteBest();
        if (this.source == BlockSource.LocalDB) {
          const localBest = await this.getLocalBest();
          if (localBest.number < best.number) {
            best = localBest;
          }
        }

        console.log('head: ', head.toString());
        console.log('best: ', best.toString());

        if (!head && !!best) {
          console.log('couldnt find head and best, exit now');
          process.exit(2);
        }

        if (best.number > head.number) {
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

  protected async processGenesis(): Promise<ChainIndicator> {
    console.log('IMPORT GENESIS');
    const blk = await this.meter.getBlock(0, 'expanded');

    const normalized = this.normalize(blk, null);
    const block = normalized.block;
    const txs = normalized.txs;
    console.log('GENESIS:', block);
    await this.persist.insertBlock(block);
    await this.persist.insertTransaction(txs);
    const head = new ChainIndicator(0, block.id);
    await this.persist.saveHead(this.headKey, head);
    return head;
  }

  protected normalize(
    blk: Meter.ExpandedBlock,
    prevBlock: Meter.ExpandedBlock
  ) {
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
            const result = await batchPersist.getExpandedBlockByNumber(i);
            block = result.block;
            txs = result.txs;
            break;
          case BlockSource.FullNode:
            const blk = await this.meter.getBlock(i, 'expanded');

            // fast load later blocks into cache if possible
            if (blk.number < endNum - 10) {
              (async () => {
                for (let i = 0; i <= 10; i++) {
                  const ref = blk;
                  await this.meter.getBlock(ref.number + i, 'expanded');
                }
              })().catch();
            }

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
          process.stdout.write(`imported: (${i}) ${block.id}`);
          console.timeEnd('time');
          console.time('time');
        }
      }
    });
  }
}
