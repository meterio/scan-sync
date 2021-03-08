import * as devkit from '@meterio/devkit';
import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import { Network, Token } from '../const';
import { AuctionDist, AuctionTx } from '../model/auctionSummary.interface';
import { Bid } from '../model/bid.interface';
import { Block } from '../model/block.interface';
import { EpochReward } from '../model/epochReward.interface';
import { EpochRewardSummary } from '../model/epochRewardSummary.interface';
import { Tx } from '../model/tx.interface';
import { RewardInfo } from '../model/validatorReward.interface';
import AuctionRepo from '../repo/auction.repo';
import AuctionSummaryRepo from '../repo/auctionSummary.repo';
import BidRepo from '../repo/bid.repo';
import EpochRewardRepo from '../repo/epochReward.repo';
import EpochRewardSummaryRepo from '../repo/epochRewardSummary.repo';
import ValidatorRewardRepo from '../repo/validatorReward.repo';
import { TxBlockReviewer } from './blockReviewer';

export class ScriptEngineCMD extends TxBlockReviewer {
  protected auctionRepo = new AuctionRepo();
  protected auctionSummaryRepo = new AuctionSummaryRepo();
  protected bidRepo = new BidRepo();
  protected epochRewardRepo = new EpochRewardRepo();
  protected epochRewardSummaryRepo = new EpochRewardSummaryRepo();
  protected validatorRewardRepo = new ValidatorRewardRepo();

  constructor(net: Network) {
    super(net);
    this.name = 'scriptengine';
    this.logger = Logger.createLogger({ name: this.name });
  }

  async processTx(tx: Tx, txIndex: number, blk: Block) {
    this.logger.info(`start to process ${tx.hash}`);

    const epoch = blk.epoch;
    const blockNum = blk.number;
    if (tx.reverted) {
      return;
    }
    const se = devkit.ScriptEngine;
    // process outputs
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      const clause = tx.clauses[clauseIndex];

      if (!se.IsScriptEngineData(clause.data)) {
        continue;
      }
      const scriptData = se.decodeScriptData(clause.data);
      if (scriptData.header.modId === se.ModuleID.Auction) {
        // auction
        const body = se.decodeAuctionBody(scriptData.payload);
        switch (body.opCode) {
          case se.AuctionOpCode.End:
            // end auction
            const endedAuction = await this.pos.getLastAuctionSummary(blockNum);
            if (endedAuction.actualPrice === '<nil>') {
              console.log('Error: empty auction, something wrong happened');
              break;
            }
            const tgtAuction = await this.auctionRepo.findByID(endedAuction.auctionID);
            if (tgtAuction.pending !== true) {
              console.log('Error: try to end an already ended auction');
              break;
            }

            let dists: AuctionDist[] = [];
            let txs: AuctionTx[] = [];
            for (const d of endedAuction.distMTRG) {
              dists.push({
                address: d.addr,
                amount: new BigNumber(d.amount),
                token: Token.MTRG,
              });
            }
            for (const t of endedAuction.auctionTxs) {
              txs.push({ ...t });
            }
            const summary = {
              id: endedAuction.auctionID,
              startHeight: endedAuction.startHeight,
              startEpoch: endedAuction.startEpoch,
              endHeight: endedAuction.endHeight,
              endEpoch: endedAuction.endEpoch,
              sequence: endedAuction.sequence,
              createTime: endedAuction.createTime,
              releasedMTRG: new BigNumber(endedAuction.releasedMTRG),
              reservedMTRG: new BigNumber(endedAuction.reservedMTRG),
              reservedPrice: new BigNumber(endedAuction.reservedPrice),
              receivedMTR: new BigNumber(endedAuction.receivedMTR),
              actualPrice: new BigNumber(endedAuction.actualPrice),
              leftoverMTRG: new BigNumber(endedAuction.leftoverMTRG),
              txs,
              distMTRG: dists,
            };
            await this.auctionSummaryRepo.create(summary);

            // update bids
            let autobidTotal = new BigNumber(0);
            let userbidTotal = new BigNumber(0);
            for (const [i, t] of txs.entries()) {
              const d = dists[i];
              const bid = await this.bidRepo.findById(t.txid);
              if (!bid) {
                console.log('Bid not found! probably missed one bid');
                continue;
              }
              if (bid.address.toLowerCase() !== d.address.toLowerCase()) {
                console.log('Address mismatch! probably the order is different');
                continue;
              }
              bid.pending = false;
              bid.hammerPrice = new BigNumber(endedAuction.actualPrice);
              bid.lotAmount = d.amount;
              await bid.save();

              if (t.type === 'autobid') {
                autobidTotal = autobidTotal.plus(t.amount);
              } else if (t.type === 'userbid') {
                userbidTotal = userbidTotal.plus(t.amount);
              }
            }

            // update auction
            tgtAuction.auctionEndEpoch = epoch;
            tgtAuction.auctionEndHeight = blockNum;
            tgtAuction.pending = false;
            // override totals based on summary
            tgtAuction.receivedMTR = new BigNumber(endedAuction.receivedMTR);
            tgtAuction.actualPrice = new BigNumber(endedAuction.actualPrice);
            tgtAuction.leftoverMTRG = new BigNumber(endedAuction.leftoverMTRG);
            tgtAuction.autobidTotal = autobidTotal;
            tgtAuction.userbidTotal = userbidTotal;

            await tgtAuction.save();
            break;
          case se.AuctionOpCode.Start:
            // TODO: handle the "auction not started" case
            // start auction
            const curAuction = await this.pos.getPresentAuctionByRevision(blockNum);
            const auction = {
              id: curAuction.auctionID,
              startHeight: curAuction.startHeight,
              startEpoch: curAuction.startEpoch,
              endHeight: curAuction.endHeight,
              endEpoch: curAuction.endEpoch,

              auctionStartHeight: blockNum,
              auctionStartEpoch: epoch,
              auctionStartTxHash: tx.hash,
              auctionStartClauseIndex: clauseIndex,

              sequence: curAuction.sequence,
              createTime: curAuction.createTime,
              releasedMTRG: new BigNumber(curAuction.releasedMTRG),
              reservedMTRG: new BigNumber(curAuction.reservedMTRG),
              reservedPrice: new BigNumber(curAuction.reservedPrice),
              receivedMTR: new BigNumber(curAuction.receivedMTR),
              actualPrice: new BigNumber(0),
              leftoverMTRG: new BigNumber(0),

              pending: true,
              bidCount: 0,
              userbidTotal: new BigNumber(0),
              autobidTotal: new BigNumber(0),
            };
            await this.auctionRepo.create(auction);
            break;
          case se.AuctionOpCode.Bid:
            // TODO: handle the tx reverted case
            // auction bid
            const atx = se.getAuctionTxFromAuctionBody(body);
            const presentAuction = await this.auctionRepo.findPresent();
            const bid: Bid = {
              id: atx.ID(),
              address: '0x' + atx.address.toString('hex'),
              amount: atx.amount,
              type: atx.type == 0 ? 'userbid' : 'autobid',
              timestamp: atx.timestamp,
              nonce: new BigNumber(atx.nonce),

              auctionID: presentAuction.id,
              epoch,
              blockNum,
              txHash: tx.hash,
              clauseIndex,

              pending: true,
            };
            await this.bidRepo.create(bid);

            // update present auction
            const present = await this.auctionRepo.findPresent();
            switch (bid.type) {
              case 'autobid':
                present.autobidTotal = present.autobidTotal.plus(bid.amount);
                break;
              case 'userbid':
                present.userbidTotal = present.userbidTotal.plus(bid.amount);
                break;
            }
            present.bidCount = present.bidCount + 1;
            present.receivedMTR = present.receivedMTR.plus(bid.amount);
            present.actualPrice = present.receivedMTR.times(1e18).dividedBy(present.releasedMTRG).dividedBy(1e18);
            if (present.actualPrice.isLessThan(present.reservedPrice)) {
              present.actualPrice = present.reservedPrice;
            }
            await present.save();
            break;
        }
      }

      if (scriptData.header.modId === se.ModuleID.Staking) {
        const body = se.decodeStakingBody(scriptData.payload);
        if (body.opCode === se.StakingOpCode.Governing) {
          let autobidTotal = new BigNumber(0);
          let transferTotal = new BigNumber(0);
          let autobidCount = 0;
          let transferCount = 0;
          const asummary = await this.pos.getLastAuctionSummary(blockNum);
          for (const atx of asummary.auctionTxs) {
            if (atx.type != 'autobid') {
              continue;
            }
            const reward: EpochReward = {
              epoch,
              blockNum,
              txHash: tx.hash,
              clauseIndex,

              address: atx.address,
              amount: new BigNumber(atx.amount),
              type: 'autobid',
            };
            await this.epochRewardRepo.create(reward);
            autobidCount++;
            autobidTotal = autobidTotal.plus(atx.amount);
          }

          const vreward = await this.pos.getLastValidatorReward(blockNum);
          for (const r of vreward.rewards) {
            const reward: EpochReward = {
              epoch,
              blockNum,
              txHash: tx.hash,
              clauseIndex,
              address: r.address,
              amount: new BigNumber(r.amount),
              type: 'transfer',
            };
            await this.epochRewardRepo.create(reward);
            transferCount++;
            transferTotal = transferTotal.plus(r.amount);
          }

          // update validator rewards
          const exist = await this.validatorRewardRepo.existEpoch(epoch);
          if (!exist) {
            let rewards: RewardInfo[] = vreward.rewards.map((info) => {
              return { amount: new BigNumber(info.amount), address: info.address };
            });
            await this.validatorRewardRepo.create({
              epoch: epoch,
              baseReward: new BigNumber(vreward.baseReward),
              totalReward: new BigNumber(vreward.totalReward),
              rewards,
            });
          }

          // update epoch reward summary
          const summaryExist = await this.epochRewardSummaryRepo.existEpoch(epoch);
          if (!summaryExist) {
            let epochSummary: EpochRewardSummary = {
              epoch,
              blockNum,
              timestamp: blk.timestamp,
              autobidTotal,
              autobidCount,
              transferCount,
              transferTotal,
              totalReward: autobidTotal.plus(transferTotal),
            };
            await this.epochRewardSummaryRepo.create(epochSummary);
          }
        }
      }
    }
  }

  async processBlock(blk: Block) {
    this.logger.info(`start to process block ${blk.number}`);
    const number = blk.number;
    const epoch = blk.epoch;
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      if (!txModel) {
        throw new Error('could not find tx, maybe the block is still being processed');
      }
      await this.processTx(txModel, txIndex, blk);
    }

    this.logger.info({ hash: blk.hash }, `processed block ${blk.number}`);
  }
}
