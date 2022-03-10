import { EventEmitter } from 'events';

import { abi } from '@meterio/devkit';
import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';
import { sha1 } from 'object-hash';

import {
  BlockType,
  BoundEvent,
  GetPosConfig,
  Network,
  PrototypeAddress,
  Token,
  TokenBasic,
  TransferEvent,
  UnboundEvent,
  ZeroAddress,
  decimalsABIFunc,
  getERC20Token,
  nameABIFunc,
  prototype,
  symbolABIFunc,
} from '../const';
import { CommitteeMember } from '../model/block.interface';
import { Block } from '../model/block.interface';
import { BlockConcise } from '../model/blockConcise.interface';
import { Bound } from '../model/bound.interface';
import { Committee } from '../model/committee.interface';
import { Erc20TxDigest } from '../model/erc20TxDigest.interface';
import { Head } from '../model/head.interface';
import { Movement } from '../model/movement.interface';
import { TokenProfile } from '../model/tokenProfile.interface';
import { Clause, PosEvent, PosTransfer, Transfer, Tx, TxOutput } from '../model/tx.interface';
import { TxDigest } from '../model/txDigest.interface';
import { Unbound } from '../model/unbound.interface';
import BlockRepo from '../repo/block.repo';
import BoundRepo from '../repo/bound.repo';
import CommitteeRepo from '../repo/committee.repo';
import Erc20TxDigestRepo from '../repo/erc20TxDigest.repo';
import HeadRepo from '../repo/head.repo';
import MovementRepo from '../repo/movement.repo';
import TokenProfileRepo from '../repo/tokenProfile.repo';
import TxRepo from '../repo/tx.repo';
import TxDigestRepo from '../repo/txDigest.repo';
import UnboundRepo from '../repo/unbound.repo';
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
  private txDigestRepo = new TxDigestRepo();
  private erc20TxDigestRepo = new Erc20TxDigestRepo();
  private tokenProfileRepo = new TokenProfileRepo();
  private boundRepo = new BoundRepo();
  private unboundRepo = new UnboundRepo();
  private movementRepo = new MovementRepo();

  private pos: Pos;
  private network: Network;

  private mtrSysToken: TokenBasic;
  private mtrgSysToken: TokenBasic;

  // cache
  private txsCache: Tx[] = [];
  private blocksCache: Block[] = [];
  private tokenProfilesCache: TokenProfile[] = [];
  private txDigestsCache: TxDigest[] = [];
  private erc20TxDigestsCache: Erc20TxDigest[] = [];
  private movementsCache: Movement[] = [];
  private boundsCache: Bound[] = [];
  private unboundsCache: Unbound[] = [];

  constructor(net: Network) {
    super();

    this.pos = new Pos(net);
    this.network = net;
    this.mtrSysToken = getERC20Token(this.network, Token.MTR);
    this.mtrgSysToken = getERC20Token(this.network, Token.MTRG);
    const posConfig = GetPosConfig(net);
    this.web3 = meterify(new Web3(), posConfig.url);
    this.cleanCache();
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

  private cleanCache() {
    this.blocksCache = [];
    this.txsCache = [];
    this.tokenProfilesCache = [];
    this.txDigestsCache = [];
    this.erc20TxDigestsCache = [];

    this.movementsCache = [];
    this.boundsCache = [];
    this.unboundsCache = [];
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

  public async cleanUpIncompleteData(blockNum: number) {
    // delete invalid/incomplete blocks
    const futureBlocks = await this.blockRepo.findFutureBlocks(blockNum);
    for (const blk of futureBlocks) {
      for (const txHash of blk.txHashs) {
        await this.txRepo.delete(txHash);
        this.logger.info({ txHash }, 'deleted tx in blocks higher than head');
      }
      await this.boundRepo.deleteAfter(blockNum);
      await this.unboundRepo.deleteAfter(blockNum);
      await this.erc20TxDigestRepo.deleteAfter(blockNum);
      await this.txDigestRepo.deleteAfter(blockNum);
      await this.tokenProfileRepo.deleteAfter(blockNum);

      await this.blockRepo.delete(blk.hash);
      this.logger.info({ number: blk.number, hash: blk.hash }, 'deleted block higher than head ');
    }
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

        await this.cleanUpIncompleteData(headNum);

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
        // begin import round from headNum+1 to tgtNum
        for (let num = headNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          // fetch block from RESTful API
          const blk = await this.getBlockFromREST(num);

          // process block
          await this.processBlock(blk);

          if (!fastforward) {
            // step over mode
            // save blocks/txs along the way
            await this.saveCacheToDB();
            await this.cleanCache();
          }
        }

        if (fastforward) {
          // fastforward mode, save blocks/txs with bulk insert
          await this.saveCacheToDB();
          await this.cleanCache();
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

  async saveCacheToDB() {
    if (this.blocksCache.length > 0) {
      const first = this.blocksCache[0];
      const last = this.blocksCache[this.blocksCache.length - 1];
      await this.blockRepo.bulkInsert(...this.blocksCache);
      // update head
      await this.updateHead(last.number, last.hash);

      if (first.number === last.number) {
        this.logger.info({ first: first.number, last: last.number }, `saved ${last.number - first.number + 1} blocks`);
      } else {
        this.logger.info({ first: first.number, last: last.number }, `saved ${last.number - first.number + 1} blocks`);
      }
    }
    if (this.tokenProfilesCache.length > 0) {
      await this.tokenProfileRepo.bulkInsert(...this.tokenProfilesCache);
      this.logger.info(`saved ${this.tokenProfilesCache.length} token profiles`);
    }
    if (this.txsCache.length > 0) {
      await this.txRepo.bulkInsert(...this.txsCache);
      this.logger.info(`saved ${this.txsCache.length} txs`);
    }
    if (this.txDigestsCache.length > 0) {
      await this.txDigestRepo.bulkInsert(...this.txDigestsCache);
      this.logger.info(`saved ${this.txDigestsCache.length} tx digests`);
    }
    if (this.erc20TxDigestsCache.length > 0) {
      await this.erc20TxDigestRepo.bulkInsert(...this.erc20TxDigestsCache);
      this.logger.info(`saved ${this.erc20TxDigestsCache.length} erc20 tx digests`);
    }

    if (this.boundsCache.length > 0) {
      await this.boundRepo.bulkInsert(...this.boundsCache);
      this.logger.info(`saved ${this.boundsCache.length} bounds`);
    }
    if (this.unboundsCache.length > 0) {
      await this.unboundRepo.bulkInsert(...this.unboundsCache);
      this.logger.info(`saved ${this.unboundsCache.length} unbounds`);
    }
    if (this.movementsCache.length > 0) {
      await this.movementRepo.bulkInsert(...this.movementsCache);
      this.logger.info(`saved ${this.movementsCache.length} movements`);
    }
  }

  async updateHead(num, hash): Promise<Head> {
    const exist = await this.headRepo.exists(this.name);
    if (!exist) {
      return await this.headRepo.create(this.name, num, hash);
    } else {
      let head = await this.headRepo.findByKey(this.name);
      this.logger.info({ num: num }, 'update head');
      // head = await this.headRepo.update(this.name, res.block.number, res.block.hash);
      head.num = num;
      head.hash = hash;
      return await head.save();
    }
  }

  async getTokenProfile(tokenAddress: string) {
    const profile = await this.tokenProfileRepo.findByAddress(tokenAddress);
    if (profile) return profile;
    for (const p of this.tokenProfilesCache) {
      if (p.address.toLowerCase() === tokenAddress) {
        return p;
      }
    }
  }

  async handleContractCreation(evt: Flex.Meter.Event, txHash: string, blockConcise: BlockConcise) {
    // FIXME: think about contract-only address, maybe need to create account for it?
    const decoded = prototype.$Master.decode(evt.data, evt.topics);

    try {
      const outputs = await this.pos.explain(
        {
          clauses: [
            { to: evt.address, value: '0x0', data: nameABIFunc.encode(), token: Token.MTR },
            { to: evt.address, value: '0x0', data: symbolABIFunc.encode(), token: Token.MTR },
            { to: evt.address, value: '0x0', data: decimalsABIFunc.encode(), token: Token.MTR },
            { to: PrototypeAddress, value: '0x0', data: prototype.master.encode(evt.address), token: Token.MTR },
            // { to: e.address, value: '0x0', data: totalSupply.encode(), token: Token.MTR },
          ],
        },
        blockConcise.hash
      );
      const nameDecoded = nameABIFunc.decode(outputs[0].data);
      const symbolDecoded = symbolABIFunc.decode(outputs[1].data);
      const decimalsDecoded = decimalsABIFunc.decode(outputs[2].data);
      // const totalSupplyDecoded = totalSupply.decode(outputs[3].data);
      const masterDecoded = prototype.master.decode(outputs[3].data);
      const name = nameDecoded['0'];
      const symbol = symbolDecoded['0'];
      const decimals = decimalsDecoded['0'];
      const master = masterDecoded['0'];
      // const totalSupplyVal = totalSupplyDecoded['0'];
      this.tokenProfilesCache.push({
        name,
        symbol,
        decimals,
        address: evt.address,
        officialSite: '',
        totalSupply: new BigNumber(0),
        holdersCount: new BigNumber(0),
        transfersCount: new BigNumber(0),
        creationTxHash: txHash,
        master: decoded.newMaster,
        firstSeen: blockConcise,
      });
    } catch (e) {
      console.log('contract created does not comply with ERC20 interface');
      console.log(e);
    }
  }

  handleBound(
    evt: Flex.Meter.Event,
    txHash: string,
    clauseIndex: number,
    logIndex: number,
    blockConcise: BlockConcise
  ) {
    const decoded = BoundEvent.decode(evt.data, evt.topics);
    const owner = decoded.owner.toLowerCase();
    this.boundsCache.push({
      owner,
      amount: new BigNumber(decoded.amount),
      token: decoded.token == 1 ? Token.MTRG : Token.MTR,
      txHash,
      block: blockConcise,
      clauseIndex,
      logIndex,
    });
  }

  handleUnbound(
    evt: Flex.Meter.Event,
    txHash: string,
    clauseIndex: number,
    logIndex: number,
    blockConcise: BlockConcise
  ) {
    const decoded = BoundEvent.decode(evt.data, evt.topics);
    const owner = decoded.owner.toLowerCase();
    this.boundsCache.push({
      owner,
      amount: new BigNumber(decoded.amount),
      token: decoded.token == 1 ? Token.MTRG : Token.MTR,
      txHash,
      block: blockConcise,
      clauseIndex,
      logIndex,
    });
  }

  async processTx(
    blk: Pos.ExpandedBlock,
    tx: Omit<Flex.Meter.Transaction, 'meta'> & Omit<Flex.Meter.Receipt, 'meta'>,
    txIndex: number
  ): Promise<void> {
    let clauses: Clause[] = [];
    let outputs: TxOutput[] = [];

    let txDigestMap: { [key: string]: TxDigest } = {}; // key: sha1(from,to) -> val: txDigest object
    let erc20DigestMap: { [key: string]: Erc20TxDigest } = {}; // key: sha1(from,to,tokenAddress) -> val: erc20Digest object

    const blockConcise = { number: blk.number, hash: blk.id, timestamp: blk.timestamp };
    // prepare events and outputs
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      let events: PosEvent[] = [];
      let transfers: PosTransfer[] = [];

      // ----------------------------------
      // Handle events
      // ----------------------------------
      for (const [logIndex, evt] of o.events.entries()) {
        events.push({ ...evt });

        // ### Handle contract creation
        if (evt.topics[0] === prototype.$Master.signature) {
          await this.handleContractCreation(evt, tx.id, blockConcise);
        }

        // ### Handle staking bound event
        if (evt.topics[0] === BoundEvent.signature) {
          this.handleBound(evt, tx.id, clauseIndex, logIndex, blockConcise);
        }

        // ### Handle staking unbound event
        if (evt.topics[0] === UnboundEvent.signature) {
          this.handleUnbound(evt, tx.id, clauseIndex, logIndex, blockConcise);
        }

        // ### Handle ERC20 transfer event
        if (evt.topics && evt.topics[0] === TransferEvent.signature) {
          let decoded: abi.Decoded;
          try {
            decoded = TransferEvent.decode(evt.data, evt.topics);
          } catch (e) {
            console.log('error decoding transfer event');
            continue;
          }

          // ### Handle movement
          let movement = {
            from: decoded._from.toLowerCase(),
            to: decoded._to.toLowerCase(),
            token: Token.ERC20,
            amount: new BigNumber(decoded._value),
            tokenAddress: '',
            txHash: tx.id,
            block: blockConcise,
            clauseIndex,
            logIndex,
            isSysContract: false,
          };
          if (evt.address.toLowerCase() === this.mtrSysToken.address) {
            // MTR: convert system contract event into system transfer
            movement.token = Token.MTR;
            movement.isSysContract = true;
          } else if (evt.address.toLowerCase() === this.mtrgSysToken.address) {
            // MTRG: convert system contract event into system transfer
            movement.token = Token.MTRG;
            movement.isSysContract = true;
          } else {
            // ERC20: other erc20 transfer
            movement.token = Token.ERC20;
            movement.tokenAddress = evt.address.toLowerCase();
          }
          this.movementsCache.push(movement);

          const base = {
            block: blockConcise,
            txHash: tx.id,
            fee: new BigNumber(tx.paid),
            from: decoded._from.toLowerCase(),
            to: decoded._to.toLowerCase(),
          };
          const amount = new BigNumber(decoded._value);
          const isMTRSysContract = evt.address.toLowerCase() === this.mtrSysToken.address;
          const isMTRGSysContract = evt.address.toLowerCase() === this.mtrgSysToken.address;

          if (isMTRSysContract || isMTRGSysContract) {
            // ### Handle sys contract transfer events
            const key = sha1({ from: base.from, to: base.to });
            // set default value
            if (!(key in txDigestMap)) {
              txDigestMap[key] = {
                ...base,
                mtr: new BigNumber(0),
                mtrg: new BigNumber(0),
                clauseIndexs: [],
                seq: 0, // later will sort and give it's actual value
              };
            }
            if (isMTRSysContract) {
              txDigestMap[key].mtr = txDigestMap[key].mtr.plus(amount);
              txDigestMap[key].clauseIndexs.push(clauseIndex);
            } else {
              txDigestMap[key].mtrg = txDigestMap[key].mtrg.plus(amount);
              txDigestMap[key].clauseIndexs.push(clauseIndex);
            }
          } else {
            // ### Handle ERC20 transfer event
            const key = sha1({ from: base.from, to: base.to, tokenAddress: evt.address });
            // set default value
            if (!(key in erc20DigestMap)) {
              erc20DigestMap[key] = {
                ...base,
                tokenAddress: evt.address,
                value: new BigNumber(0),
                name: '',
                symbol: '',
                decimals: 18,
              };
            }
            erc20DigestMap[key].value = erc20DigestMap[key].value.plus(amount);
            const profile = await this.getTokenProfile(evt.address);
            if (profile) {
              erc20DigestMap[key].name = profile.name;
              erc20DigestMap[key].symbol = profile.symbol;
              erc20DigestMap[key].decimals = profile.decimals;
            }

            this.logger.info('unrecognized token');
          }
        }
      } // End of handling events

      // ----------------------------------
      // Handle transfers
      // ----------------------------------
      for (const [logIndex, tr] of o.transfers.entries()) {
        transfers.push({ ...tr });

        this.movementsCache.push({
          from: tr.sender.toLowerCase(),
          to: tr.recipient.toLowerCase(),
          token: new BigNumber(tr.token).isEqualTo(1) ? Token.MTRG : Token.MTR,
          tokenAddress: '',
          amount: new BigNumber(tr.amount),
          txHash: tx.id,
          block: blockConcise,
          clauseIndex,
          logIndex,
          isSysContract: false,
        });

        const key = sha1({ from: tr.sender, to: tr.recipient });
        if (!(key in txDigestMap)) {
          txDigestMap[key] = {
            block: blockConcise,
            txHash: tx.id,
            fee: new BigNumber(tx.paid),
            from: tr.sender,
            to: tr.recipient,
            mtr: new BigNumber(0),
            mtrg: new BigNumber(0),
            clauseIndexs: [],
            seq: 0,
          };
        }
        txDigestMap[key].clauseIndexs.push(clauseIndex);

        // update total transfer
        if (tr.token == 0) {
          txDigestMap[key].mtr = txDigestMap[key].mtr.plus(tr.amount);
        }
        if (tr.token == 1) {
          txDigestMap[key].mtrg = txDigestMap[key].mtrg.plus(tr.amount);
        }
      } // End of handling transfers

      outputs.push({ contractAddress: o.contractAddress, events, transfers });
    }

    const txModel: Tx = {
      hash: tx.id,
      block: blockConcise,
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
    };

    this.txsCache.push(txModel);
    this.txDigestsCache.push(...Object.values(txDigestMap));
    this.erc20TxDigestsCache.push(...Object.values(erc20DigestMap));
    this.logger.info({ hash: txModel.hash }, 'processed tx');
  }

  async processBlock(blk: Pos.ExpandedBlock): Promise<void> {
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

    let txHashs: string[] = [];
    let committee: CommitteeMember[] = [];
    let index = 0;
    for (const tx of blk.transactions) {
      await this.processTx(blk, tx, index);
      txHashs.push(tx.id);
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
        console.log(`update epoch ${prevEndBlock.qc.epochID}  with endBlock: [${endBlock.number}]`, endBlock.hash);
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
    this.logger.info({ number: blk.number, txCount: blk.transactions.length }, 'processed PoS block');
    this.blocksCache.push(block);
  }
}
