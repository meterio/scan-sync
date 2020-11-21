import { Net } from '../utils/net';
import { Pos } from '../utils/pos-rest';
import * as Logger from 'bunyan';
import { EventEmitter } from 'events';
import BlockRepo from '../repo/block.repo';
import { sleep, InterruptedError } from '../utils/utils';
import BigNumber from 'bignumber.js';
import { Tx, Clause, TxOutput, PosEvent, PosTransfer } from '../model/tx.interface';
import { BlockType, Network } from '../const';
import TxRepo from '../repo/tx.repo';
import HeadRepo from '../repo/head.repo';
import { CMD } from './cmd';

const Web3 = require('web3');
const meterify = require('meterify').meterify;

const SAMPLING_INTERVAL = 500;
const PRELOAD_WINDOW = 10;

export class PosCMD extends CMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'pos';
  private logger = Logger.createLogger({ name: this.name });
  private web3 = meterify(new Web3(), process.env.POS_PROVIDER_URL);

  private blockRepo = new BlockRepo();
  private txRepo = new TxRepo();
  private headRepo = new HeadRepo();
  private pos: Pos;

  constructor(net: Network) {
    super();
    this.pos = new Pos(new Net(process.env.POS_PROVIDER_URL), net);
  }

  public async start() {
    this.logger.info(`${this.name}: start`);
    this.loop();
    return;
  }

  public stop() {
    this.shutdown = true;

    return new Promise((resolve) => {
      this.logger.info('shutting down......');
      this.ev.on('closed', resolve);
    });
  }

  private async getBlockFromREST(num: number) {
    const b = await this.pos.getBlock(num, 'expanded');

    // preload blocks
    (async () => {
      for (let i = 1; i <= PRELOAD_WINDOW; i++) {
        await this.pos.getBlock(num + i, 'expanded');
      }
    })().catch();
    return b;
  }

  public async loop() {
    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);

        let head = await this.headRepo.findByKey(this.name);
        let headNum = !!head ? head.num : -1;

        // delete invalid/incomplete blocks
        const futureBlocks = await this.blockRepo.findFutureBlocks(headNum);
        for (const blk of futureBlocks) {
          for (const txHash of blk.txHashs) {
            await this.txRepo.delete(txHash);
            this.logger.info({ txHash }, 'deleted tx in blocks higher than head');
          }
          await this.blockRepo.delete(blk.hash);
          this.logger.info({ number: blk.number, hash: blk.hash }, 'deleted block higher than head ');
        }

        const bestNum = await this.web3.eth.getBlockNumber();
        const tgtNum = bestNum - headNum > 1000 ? headNum + 1000 : bestNum;

        this.logger.info(
          { best: bestNum, head: headNum },
          `start import PoS block from number ${headNum + 1} to ${tgtNum}`
        );
        for (let num = headNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.getBlockFromREST(num);
          await this.processBlock(blk);
          this.logger.info({ number: blk.number, hash: blk.id }, 'imported PoS block');

          // update head
          if (!head) {
            head = await this.headRepo.create(this.name, blk.number, blk.id);
          } else {
            head = await this.headRepo.update(this.name, blk.number, blk.id);
          }
        }
      } catch (e) {
        if (!(e instanceof InterruptedError)) {
          this.logger.error(this.name + 'loop: ' + (e as Error).stack);
        } else {
          if (this.shutdown) {
            this.ev.emit('closed');
            break;
          }
        }
      }
    }
  }

  async processTx(
    blk: Pos.ExpandedBlock,
    tx: Omit<Flex.Meter.Transaction, 'meta'> & Omit<Flex.Meter.Receipt, 'meta'>,
    txIndex: number
  ): Promise<Tx> {
    let clauses: Clause[] = [];
    for (const c of tx.clauses) {
      clauses.push({
        to: c.to,
        value: new BigNumber(c.value),
        token: c.token,
        data: c.data,
      });
    }

    let outputs: TxOutput[] = [];
    let outIndex = 0;

    // prepare events and outputs
    for (const o of tx.outputs) {
      let evts: PosEvent[] = [];
      let transfers: PosTransfer[] = [];
      for (const evt of o.events) {
        evts.push({ ...evt });
      }
      for (const tr of o.transfers) {
        transfers.push({ ...tr });
      }
      outputs.push({
        contractAddress: o.contractAddress,
        events: evts,
        transfers: transfers,
      });
      outIndex++;
    }
    const txModel: Tx = {
      hash: tx.id,
      block: {
        number: blk.number,
        hash: blk.id,
        timestamp: blk.timestamp,
      },

      txIndex,
      chainTag: tx.chainTag,
      blockRef: tx.blockRef,
      expiration: tx.expiration,
      gasPriceCoef: tx.gasPriceCoef,
      gas: tx.gas,
      nonce: tx.nonce,
      dependsOn: tx.dependsOn,
      origin: tx.origin,
      clauses: clauses,
      clauseCount: tx.clauses.length,
      size: tx.size,
      gasUsed: tx.gasUsed,
      gasPayer: tx.gasPayer,
      paid: new BigNumber(tx.paid),
      reward: new BigNumber(tx.reward),
      reverted: tx.reverted,
      outputs: outputs,
    };

    this.logger.info({ hash: txModel }, 'processed tx');
    return txModel;
  }

  async processBlock(blk: Pos.ExpandedBlock) {
    let score = 0;
    let gasChanged = 0;
    let reward = new BigNumber(0);
    let txCount = blk.transactions.length;
    if (blk.number > 0) {
      const prevBlk = await this.pos.getBlock(blk.parentID, 'regular');
      score = blk.totalScore - prevBlk.totalScore;
      gasChanged = blk.gasLimit - prevBlk.gasLimit;
    }

    let txs: Tx[] = [];
    let txHashs: string[] = [];
    let index = 0;
    for (const tx of blk.transactions) {
      const txModel = await this.processTx(blk, tx, index);
      txHashs.push(tx.id);
      txs.push(txModel);
      index++;
      reward = reward.plus(tx.reward);
    }
    await this.blockRepo.create({
      ...blk,
      hash: blk.id,
      txHashs,
      reward,
      gasChanged,
      score,
      txCount,
      blockType: blk.isKBlock ? BlockType.KBlock : BlockType.MBlock,
    });
    if (txs.length > 0) {
      let clauseCount = 0;
      for (const t of txs) {
        clauseCount += t.clauseCount;
      }
      await this.txRepo.bulkInsert(...txs);
      this.logger.info(`saved ${txs.length} txs, ${clauseCount} clauses`);
    }
  }
}
