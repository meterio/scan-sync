import { Meter } from '../../meter-rest';
import { EntityManager } from 'typeorm';
import * as logger from '../../logger';
import { Transaction } from '../../powergrid-db/entity/transaction';
import { PosProcessor, BlockSource } from '../pos-processor';

import { Block } from '../../powergrid-db/entity/block';

const HEAD_KEY = 'pos-chain-head';
const SOURCE = BlockSource.FullNode;

export class PosChain extends PosProcessor {
  constructor(readonly meter: Meter) {
    super(HEAD_KEY, SOURCE, meter);
  }

  protected bornAt() {
    return Promise.resolve(0);
  }

  protected async processBlock(
    b: Block,
    txs: Transaction[],
    manager: EntityManager
  ) {
    logger.log(`processing: (${b.number}) ${b.id}`);
    let score = 0;
    let gasChanged = 0;

    if (b.number > 0) {
      const prevBlock = (await this.meter.getBlock(b.parentID, 'regular'))!;
      score = b.totalScore - prevBlock.totalScore;
      gasChanged = b.gasLimit - prevBlock.gasLimit;
    }

    let transactions: Transaction[] = [];
    for (const tx of txs) {
      const clauseCount = tx.clauses ? tx.clauses.length : 0;
      const txPaid = tx.paid ? BigInt(tx.paid) : BigInt(0);
      const txReward = tx.paid ? BigInt(tx.reward) : BigInt(0);
      logger.log(`processing tx: ${tx.txID}`);
      transactions.push({
        ...tx,
        clauseCount: clauseCount,
        paid: txPaid,
        reward: txReward,
      });
    }
    await this.persist.insertBlock(b);
    // logger.log(`saved block: (${b.number}) ${b.id}`);
    if (txs.length) {
      await this.persist.insertTransaction(txs);
    }
    return 1 + txs.length * 2;
  }
}
