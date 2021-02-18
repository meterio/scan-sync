import { EventEmitter } from 'events';

import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import { BlockType, GetPosConfig, Network } from '../const';
import { CommitteeMember } from '../model/block.interface';
import { BlockConcise } from '../model/blockConcise.interface';
import { blockConciseSchema } from '../model/blockConcise.model';
import { Committee } from '../model/committee.interface';
import { Clause, PosEvent, PosTransfer, Tx, TxOutput } from '../model/tx.interface';
import BlockRepo from '../repo/block.repo';
import CommitteeRepo from '../repo/committee.repo';
import HeadRepo from '../repo/head.repo';
import TxRepo from '../repo/tx.repo';
import { isHex } from '../utils/hex';
import { Pos } from '../utils/pos-rest';
import { InterruptedError, sleep } from '../utils/utils';
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

  private web3: any;

  private blockRepo = new BlockRepo();
  private txRepo = new TxRepo();
  private headRepo = new HeadRepo();
  private committeeRepo = new CommitteeRepo();
  private pos: Pos;

  constructor(net: Network) {
    super();

    this.pos = new Pos(net);
    const posConfig = GetPosConfig(net);
    this.web3 = meterify(new Web3(), posConfig.url);
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

        if (tgtNum <= headNum) {
          continue;
        }
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
    let committee: CommitteeMember[] = [];
    let index = 0;
    for (const tx of blk.transactions) {
      const txModel = await this.processTx(blk, tx, index);
      txHashs.push(tx.id);
      txs.push(txModel);
      index++;
      reward = reward.plus(tx.reward);
    }
    for (const m of blk.committee) {
      if (isHex(m.pubKey)) {
        const buf = Buffer.from(m.pubKey, 'hex');
        const base64PK = buf.toString('base64');
        committee.push({ ...m, pubKey: base64PK });
      } else {
        committee.push({ ...m });
      }
    }
    let powBlocks: Flex.Meter.PowBlock[] = [];
    if (blk.powBlocks) {
      for (const pb of blk.powBlocks) {
        powBlocks.push({ ...pb });
      }
    } else {
      if (blk.isKBlock) {
        const epochInfo = await this.pos.getEpochInfo(blk.qc.epochID);
        for (const pb of epochInfo.powBlocks) {
          powBlocks.push({ ...pb });
        }
      }
    }

    // update committee repo
    const blockConcise = { ...blk, hash: blk.id } as BlockConcise;
    if (!!blk.committee && blk.committee.length > 0) {
      let members: CommitteeMember[] = [];
      for (const cm of blk.committee) {
        const member = cm as CommitteeMember;
        members.push(member);
      }
      const committee: Committee = {
        epoch: blk.qc.epochID + 1,
        kblockHeight: blk.lastKBlockHeight,
        startBlock: blockConcise,
        members,
      };
      await this.committeeRepo.create(committee);
      console.log(`update committee for epoch ${blk.qc.epochID}`);

      if (blk.qc.epochID > 0) {
        const prevEndBlock = await this.getBlockFromREST(blk.lastKBlockHeight);
        const endBlock = { hash: prevEndBlock.id, ...prevEndBlock } as BlockConcise;
        await this.committeeRepo.updateEndBlock(prevEndBlock.qc.epochID, endBlock);
        console.log(`update epoch ${prevEndBlock.qc.epochID}  with endBlock: `, endBlock);
      }
    }

    let epoch = 0;
    if (blk.number === blk.lastKBlockHeight + 1) {
      epoch = blk.epoch;
    } else {
      epoch = blk.qc.epochID;
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

      epoch,
      committee,
      nonce: String(blk.nonce),
      qc: { ...blk.qc },
      powBlocks,
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
