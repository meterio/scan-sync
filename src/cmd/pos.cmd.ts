import { EventEmitter } from 'events';

import { abi } from '@meterio/devkit';
import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import {
  BlockType,
  GetPosConfig,
  Network,
  Token,
  TokenBasic,
  TransferEvent,
  ZeroAddress,
  getERC20Token,
} from '../const';
import { CommitteeMember } from '../model/block.interface';
import { Block } from '../model/block.interface';
import { BlockConcise } from '../model/blockConcise.interface';
import { Committee } from '../model/committee.interface';
import { Clause, PosEvent, PosTransfer, Transfer, Tx, TxOutput } from '../model/tx.interface';
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

const FASTFORWARD_SAMPLING_INTERVAL = 300;
const SAMPLING_INTERVAL = 2000;
const PRELOAD_WINDOW = 10;
const LOOP_WINDOW = 50;

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
  private network: Network;

  private mtrSysToken: TokenBasic;
  private mtrgSysToken: TokenBasic;

  constructor(net: Network) {
    super();

    this.pos = new Pos(net);
    this.network = net;
    this.mtrSysToken = getERC20Token(this.network, Token.STPT);
    this.mtrgSysToken = getERC20Token(this.network, Token.VERSE);
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
    let fastforward = true;
    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        if (fastforward) {
          await sleep(FASTFORWARD_SAMPLING_INTERVAL);
        } else {
          await sleep(SAMPLING_INTERVAL);
        }

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
        let tgtNum = headNum + LOOP_WINDOW;
        if (tgtNum > bestNum) {
          fastforward = false;
          tgtNum = bestNum;
        } else {
          fastforward = true;
        }

        if (tgtNum <= headNum) {
          continue;
        }
        this.logger.info(
          { best: bestNum, head: headNum },
          `start import PoS block from number ${headNum + 1} to ${tgtNum}`
        );
        let blocks: Block[] = [];
        let txs: Tx[] = [];
        for (let num = headNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.getBlockFromREST(num);
          const res = await this.processBlock(blk);
          if (fastforward) {
            // fast forward mode
            blocks.push(res.block);
            txs = txs.concat(res.txs);
          } else {
            // step mode
            await this.blockRepo.create(res.block);
            this.logger.info(`saved block ${res.block.number}`);
            if (res.txs.length > 0) {
              await this.txRepo.bulkInsert(...res.txs);
              this.logger.info(`saved ${res.txs.length} txs`);
            }
            // update head
            if (!head) {
              head = await this.headRepo.create(this.name, res.block.number, res.block.hash);
            } else {
              this.logger.info({ num: res.block.number }, 'update head');
              // head = await this.headRepo.update(this.name, res.block.number, res.block.hash);
              head.num = res.block.number;
              head.hash = res.block.hash;
              await head.save();
            }
          }

          // print
          let txCount = 0;
          if (res.txs.length > 0) {
            txCount = res.txs.length;
          }
          this.logger.info({ number: blk.number, txCount: txCount }, 'processed PoS block');
        }

        if (fastforward) {
          // fastforward mode, save blocks and txs with bulk insert
          if (blocks.length > 0) {
            const first = blocks[0];
            const last = blocks[blocks.length - 1];
            this.logger.info(
              { first: first.number, last: last.number },
              `saved ${last.number - first.number + 1} blocks`
            );
            await this.blockRepo.bulkInsert(...blocks);
            // update head
            if (!head) {
              head = await this.headRepo.create(this.name, last.number, last.hash);
            } else {
              this.logger.info({ num: last.number }, 'update head');
              // head = await this.headRepo.update(this.name, last.number, last.hash);
              head.num = last.number;
              head.hash = last.hash;
              await head.save();
            }
          }
          if (txs.length > 0) {
            this.logger.info(`saved ${txs.length} txs`);
            await this.txRepo.bulkInsert(...txs);
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
    let totalClauseMTR = new BigNumber(0);
    let totalClauseMTRG = new BigNumber(0);
    let totalTransferMTR = new BigNumber(0);
    let totalTransferMTRG = new BigNumber(0);
    let groupedTransfers: Transfer[] = [];
    let sysContractTransfers: Transfer[] = [];
    let relatedAddrs = new Set([]);
    let erc20RelatedAddrs = new Set([]);

    // add tx.origin
    relatedAddrs.add(tx.origin);

    let toCount = 0;
    let tos: { [key: string]: boolean } = {};
    let majorTo = '';

    for (const c of tx.clauses) {
      // add clauses.to
      if (c.to) {
        relatedAddrs.add(c.to.toLowerCase());
      }

      clauses.push({
        to: c.to,
        value: new BigNumber(c.value),
        token: c.token,
        data: c.data,
      });
      if (c.token == 0) {
        totalClauseMTR = totalClauseMTR.plus(c.value);
      }
      if (c.token == 1) {
        totalClauseMTRG = totalClauseMTRG.plus(c.value);
      }
      if (!(c.to in tos)) {
        toCount++;
        tos[c.to] = true;
      }
    }

    let outputs: TxOutput[] = [];
    let outIndex = 0;

    // prepare events and outputs
    for (const o of tx.outputs) {
      let evts: PosEvent[] = [];
      let transfers: PosTransfer[] = [];
      for (const evt of o.events) {
        evts.push({ ...evt });
        if (evt.topics && evt.topics[0] === TransferEvent.signature) {
          let decoded: abi.Decoded;
          try {
            decoded = TransferEvent.decode(evt.data, evt.topics);
          } catch (e) {
            console.log('error decoding topics');
            continue;
          }

          // add ERC20 transfer.from && transfer.to
          relatedAddrs.add(decoded._from.toLowerCase());
          relatedAddrs.add(decoded._to.toLowerCase());
          relatedAddrs.add(evt.address.toLowerCase());

          if (
            evt.address.toLowerCase() !== this.mtrSysToken.address &&
            evt.address.toLowerCase() !== this.mtrgSysToken.address
          ) {
            // ERC20 Transfer
            erc20RelatedAddrs.add(decoded._from.toLowerCase());
            erc20RelatedAddrs.add(decoded._to.toLowerCase());
            erc20RelatedAddrs.add(evt.address.toLowerCase());
          } else {
            let token: Token;
            if (evt.address.toLowerCase() === this.mtrSysToken.address) {
              token = Token.STPT;
            } else if (evt.address.toLowerCase() === this.mtrgSysToken.address) {
              token = Token.VERSE;
            } else {
              this.logger.info('unrecognized token');
            }
            // sys contract transfer
            sysContractTransfers.push({
              sender: decoded._from.toLowerCase(),
              recipient: decoded._to.toLowerCase(),
              amount: new BigNumber(decoded._value),
              token,
            });
          }
        }
      }
      for (const tr of o.transfers) {
        // add transfer.sender && transfer.recipient
        relatedAddrs.add(tr.sender.toLowerCase());
        relatedAddrs.add(tr.recipient.toLowerCase());

        transfers.push({ ...tr });

        // update total transfer
        if (tr.token == 0) {
          totalTransferMTR = totalTransferMTR.plus(tr.amount);
        }
        if (tr.token == 1) {
          totalTransferMTRG = totalTransferMTRG.plus(tr.amount);
        }

        // update grouped transfers
        let found = false;
        for (const gt of groupedTransfers) {
          if (gt.sender === tr.sender && gt.recipient === tr.recipient && gt.token === tr.token) {
            gt.amount = gt.amount.plus(tr.amount);
            found = true;
            break;
          }
        }
        if (!found) {
          groupedTransfers.push({
            ...tr,
            amount: new BigNumber(tr.amount),
          });
        }
      }
      outputs.push({
        contractAddress: o.contractAddress,
        events: evts,
        transfers: transfers,
      });
      outIndex++;
    }
    const sortedGroupedTransfers = groupedTransfers.sort((a, b) => {
      return a.amount.isGreaterThan(b.amount) ? -1 : 1;
    });
    if (sortedGroupedTransfers && sortedGroupedTransfers.length > 0) {
      majorTo = sortedGroupedTransfers[0].recipient;
    }
    if (!majorTo && tx.clauses && tx.clauses.length > 0) {
      for (const c of tx.clauses) {
        if (c.to) {
          majorTo = c.to;
          break;
        }
      }
    }
    if (!majorTo) {
      majorTo = '';
    }
    majorTo = majorTo.toLowerCase();

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
      origin: tx.origin.toLowerCase(),
      clauses: clauses.map((c) => ({ ...c, to: c.to ? c.to.toLowerCase() : ZeroAddress })),
      clauseCount: tx.clauses.length,
      size: tx.size,
      gasUsed: tx.gasUsed,
      gasPayer: tx.gasPayer,
      paid: new BigNumber(tx.paid),
      reward: new BigNumber(tx.reward),
      reverted: tx.reverted,
      outputs: outputs,

      totalClauseMTR,
      totalClauseMTRG,
      totalTransferMTR,
      totalTransferMTRG,
      groupedTransfers: sortedGroupedTransfers,
      majorTo,
      toCount,

      relatedAddrs: Array.from(relatedAddrs.values()),
      erc20RelatedAddrs: Array.from(erc20RelatedAddrs.values()),
      sysContractTransfers: sysContractTransfers,
    };

    this.logger.info({ hash: txModel.hash }, 'processed tx');
    return txModel;
  }

  async processBlock(blk: Pos.ExpandedBlock): Promise<{ block: Block; txs: Tx[] }> {
    this.logger.info({ number: blk.number }, 'start to process block');
    let score = 0;
    let gasChanged = 0;
    let reward = new BigNumber(0);
    let actualReward = new BigNumber(0);
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
      if (tx.origin !== ZeroAddress) {
        actualReward = actualReward.plus(tx.reward);
      }
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
          powBlocks.push({ ...pb, beneficiary: pb.Beneficiary || pb.beneficiary });
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
    const block = {
      ...blk,
      hash: blk.id,
      txHashs,
      reward,
      actualReward,
      gasChanged,
      score,
      txCount,
      blockType: blk.isKBlock ? BlockType.KBlock : BlockType.MBlock,

      epoch,
      committee,
      nonce: String(blk.nonce),
      qc: { ...blk.qc },
      powBlocks,
    };
    return { block, txs };
  }
}
