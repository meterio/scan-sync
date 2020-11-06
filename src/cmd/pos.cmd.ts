import { Net } from '../utils/net';
import { Pos } from '../utils/pos-rest';
import * as Logger from 'bunyan';
import { EventEmitter } from 'events';
import BlockRepo from '../repo/block.repo';
import { sleep, InterruptedError } from '../utils/utils';
import { Network } from '../const';
import BigNumber from 'bignumber.js';
import {
  Tx,
  Clause,
  TxOutput,
  PosEvent,
  PosTransfer,
} from '../model/tx.interface';
import { BlockType } from '../const/model';
import TxRepo from '../repo/tx.repo';
import { Transfer } from '../model/transfer.interface';
import AccountRepo from '../repo/account.repo';
import TransferRepo from '../repo/transfer.repo';
import { Token } from '../const/model';
import { Account } from '../model/account.interface';

const getAccountID = (act: Account): string => {
  return `${act.address}_${Token[act.token]}`;
};
const Web3 = require('web3');
const meterify = require('meterify').meterify;

const SAMPLING_INTERVAL = 500;
const PRELOAD_WINDOW = 10;

export class PosCMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'pos';
  private logger = Logger.createLogger({ name: this.name });
  private web3 = meterify(new Web3(), 'http://shoal.meter.io:8669');
  private blockRepo = new BlockRepo();
  private txRepo = new TxRepo();
  private accountRepo = new AccountRepo();
  private transferRepo = new TransferRepo();
  private pos = new Pos(new Net('http://tetra.meter.io:8669'), Network.DevNet);

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
    const localBestBlock = await this.blockRepo.getBestBlock();
    const localBestNum = !!localBestBlock ? localBestBlock.number : 0;
    this.logger.info(`start import block from number ${localBestNum}`);

    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);

        const localBestBlock = await this.blockRepo.getBestBlock();
        const localBestNum = !!localBestBlock ? localBestBlock.number : 0;
        const bestNum = await this.web3.eth.getBlockNumber();

        const tgtNum =
          bestNum - localBestNum > 1000 ? localBestNum + 1000 : bestNum;

        for (let num = localBestNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.getBlockFromREST(num);
          await this.processBlock(blk);
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

  getTransfers(blk: Pos.ExpandedBlock, txModel: Tx) {
    const fromAddr = txModel.origin;
    let transfers = [];
    for (const c of txModel.clauses) {
      const toAddr = c.to;
      const transfer: Transfer = {
        from: fromAddr,
        to: toAddr,
        amount: new BigNumber(c.value),
        token: c.token,
        txHash: txModel.hash,
        blockHash: blk.id,
      };
      transfers.push(transfer);
    }
    return transfers;
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
    for (const o of tx.outputs) {
      let evts: PosEvent[] = [];
      let transfers: PosTransfer[] = [];
      for (const evt of o.events) {
        evts.push({ ...evt });
      }
      for (const tr of o.transfers) {
        transfers.push({ ...tr, token: clauses[outIndex].token });
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

    console.log('processed tx: ', txModel.hash);
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
    let transfers = [];
    let acctDeltas: { [key: string]: BigNumber } = {};
    for (const tx of blk.transactions) {
      console.log('tx: ', tx);
      const txModel = await this.processTx(blk, tx, index);
      const blockTranfers = this.getTransfers(blk, txModel);
      transfers = transfers.concat(blockTranfers);
      txHashs.push(tx.id);
      txs.push(txModel);
      index++;
      reward = reward.plus(tx.reward);
    }
    const accts = await this.accountRepo.findByAddressList(
      Object.keys(acctDeltas)
    );
    let acctMap: { [key: string]: Account } = {};
    for (const act of accts) {
      acctMap[getAccountID(act)] = act;
    }
    await this.txRepo.bulkInsert(...txs);
    await this.transferRepo.bulkInsert(...transfers);
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
    this.logger.info(
      { number: blk.number, id: blk.id },
      `processed block ${blk.number}`
    );
  }
}
