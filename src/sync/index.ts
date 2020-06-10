import { Meter } from '../meter-rest';
import { Persist } from './persist';
import { getConnection, EntityManager } from 'typeorm';
import { blockIDtoNum, displayID, sleep, InterruptedError } from '../utils';
import { EventEmitter } from 'events';
import * as logger from '../logger';
import { BranchTransaction } from '../powergrid-db/entity/branch-transaction';
import { TransactionMeta } from '../powergrid-db/entity/tx-meta';

const SAMPLING_INTERVAL = 500;

export class Foundation {
  private head: string | null = null;
  private persist: Persist;
  private shutdown = false;
  private ev = new EventEmitter();

  constructor(readonly meter: Meter) {
    this.persist = new Persist();
  }

  public async start() {
    this.loop();
    return;
  }

  public stop() {
    this.shutdown = true;

    return new Promise((resolve) => {
      logger.log('shutting down......');
      this.ev.on('closed', resolve);
    });
  }

  private async getHead(): Promise<string> {
    if (this.head !== null) {
      return this.head;
    } else {
      const config = await this.persist.getHead();

      if (!config) {
        console.log('could not load head from database');
        process.exit(1);
      } else {
        return config.value;
      }
    }
  }

  private async buildFork(
    trunkHead: Meter.ExpandedBlock,
    branchHead: Meter.ExpandedBlock
  ) {
    let t = trunkHead;
    let b = branchHead;

    const branch: Meter.ExpandedBlock[] = [];
    const trunk: Meter.ExpandedBlock[] = [];

    for (;;) {
      if (t.number > b.number) {
        trunk.push(t);
        t = (await this.meter.getBlock(t.parentID, 'expanded'))!;
        continue;
      }

      if (t.number < b.number) {
        branch.push(b);
        b = (await this.meter.getBlock(b.parentID, 'expanded'))!;
        continue;
      }

      if (t.id === b.id) {
        return {
          ancestor: t.id,
          trunk: trunk.reverse(),
          branch: branch.reverse(),
        };
      }

      trunk.push(t);
      branch.push(b);

      t = (await this.meter.getBlock(t.parentID, 'expanded'))!;
      b = (await this.meter.getBlock(b.parentID, 'expanded'))!;
    }
  }

  private async loop() {
    console.log('start the loop');
    for (;;) {
      try {
        if (this.shutdown) {
          console.log('shutdown basis sync task');
          return;
        }
        await sleep(SAMPLING_INTERVAL);

        let head = await this.getHead();
        const best = (await this.meter.getBlock('best', 'expanded'))!;

        if (!head) {
          await this.fastForward(best.number);
          head = await this.getHead();
        } else {
          const headNum = blockIDtoNum(head);
          if (headNum < best.number) {
            await this.fastForward(best.number);
            head = await this.getHead();
          } else {
            continue;
          }
        }

        if (best.parentID === head) {
          const timeLogger = logger.taskTime(new Date());
          await getConnection().transaction(async (manager) => {
            await this.block(best).process(manager);
            await this.persist.saveHead(best.id, manager);
            logger.log(
              `-> save head: ${displayID(best.id)}(${
                best.timestamp % 60
              }) ${timeLogger(new Date())}`
            );
          });
          this.head = best.id;
        } else {
          const headBlock = (await this.meter.getBlock(head, 'expanded'))!;
          const { ancestor, trunk, branch } = await this.buildFork(
            best,
            headBlock
          );

          if (branch.length || ancestor !== head) {
            // let latestTrunkCheck do the heavy work
            continue;
          }

          await getConnection().transaction(async (manager) => {
            for (const b of trunk) {
              await this.block(b).process(manager);
            }
            await this.persist.saveHead(best.id, manager);
            logger.log('-> save head:' + displayID(best.id));
          });
          this.head = best.id;
        }
      } catch (e) {
        if (!(e instanceof InterruptedError)) {
          logger.error('foundation loop: ' + (e as Error).stack);
        } else {
          if (this.shutdown) {
            this.ev.emit('closed');
            break;
          }
        }
      }
    }
  }

  private block(b: Meter.ExpandedBlock) {
    let isTrunk = true;
    let justUpdate = false;
    return {
      branch() {
        isTrunk = false;
        return this;
      },
      update() {
        justUpdate = true;
        return this;
      },
      process: async (manager: EntityManager): Promise<number> => {
        console.log('start to process: ', b.number, ':', b.id);
        let reward = BigInt(0);
        let score = 0;
        let gasChanged = 0;

        if (b.number > 0) {
          const prevBlock = (await this.meter.getBlock(b.parentID, 'regular'))!;
          score = b.totalScore - prevBlock.totalScore;
          gasChanged = b.gasLimit - prevBlock.gasLimit;
        }
        console.log('after finding prev block');

        const txs: Array<Omit<Omit<BranchTransaction, 'block'>, 'id'>> = [];
        const metas: Array<Omit<
          Omit<TransactionMeta, 'block'>,
          'transaction'
        >> = [];

        for (const [index, tx] of b.transactions.entries()) {
          let meta = {
            txID: tx.id,
            blockID: b.id,
            seq: {
              blockNumber: b.number,
              txIndex: index,
            },
          };
          metas.push(meta);
          const clauseCount = tx.clauses ? tx.clauses.length : 0;
          const txPaid = tx.paid ? BigInt(tx.paid) : BigInt(0);
          const txReward = tx.paid ? BigInt(tx.reward) : BigInt(0);
          console.log('blk.id:', b.id, 'tx id:', tx.id);
          txs.push({
            txID: tx.id,
            blockID: b.id,
            seq: {
              blockNumber: b.number,
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
          });
          reward += txReward;
        }
        if (justUpdate) {
          await this.persist.updateBlock(b.id, { isTrunk }, manager);
        } else {
          console.log('try to insert block', b.number, ':', b.id);
          await this.persist.insertBlock(
            {
              ...b,
              isTrunk,
              score,
              reward,
              gasChanged,
              txCount: b.transactions.length,
            },
            manager
          );
          console.log('inserted block: ', b.number, ':', b.id);
        }
        if (txs.length) {
          if (isTrunk) {
            await this.persist.insertTransactionMeta(metas, manager);
            await this.persist.insertTransaction(txs, manager);
          } else {
            await this.persist.insertTransaction(txs, manager);
          }
        }
        return 1 + txs.length * 2;
      },
    };
  }

  private async fastForward(target: number) {
    console.log('fast forward, target=', target);
    const head = await this.getHead();
    const headNum = head ? blockIDtoNum(head) : -1;

    let count = 0;
    let b: Meter.ExpandedBlock;

    for (let i = headNum + 1; i <= target; ) {
      const startNum = i;
      await getConnection().transaction(async (manager) => {
        for (; i <= target; ) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          b = (await this.getBlockFromREST(i++))!;
          count += await this.block(b).process(manager);

          if (count >= 5) {
            await this.persist.saveHead(b.id, manager);
            process.stdout.write(
              `imported blocks(${i - startNum}) at block(${displayID(b.id)}) `
            );

            count = 0;
            break;
          }

          if (i === target + 1) {
            await this.persist.saveHead(b.id, manager);
            process.stdout.write(
              `imported blocks(${i - startNum}) at block(${displayID(b.id)}) `
            );
            break;
          }
        }
      });
      this.head = b!.id;
    }
  }

  private async getBlockFromREST(num: number) {
    const b = await this.meter.getBlock(num, 'expanded');
    // cache for the following blocks
    /*
    (async () => {
      for (let i = 1; i <= 10; i++) {
        await this.meter.getBlock(num + i, 'expanded');
      }
    })().catch();
    */
    return b;
  }
}
