import * as devkit from '@meterio/devkit';
import {
  AuctionDist,
  AuctionRepo,
  AuctionSummaryRepo,
  AuctionTx,
  Bid,
  BidRepo,
  Block,
  EpochReward,
  EpochRewardRepo,
  EpochRewardSummary,
  EpochRewardSummaryRepo,
  Known,
  KnownRepo,
  Network,
  RewardInfo,
  Token,
  Tx,
  ValidatorRewardRepo,
} from '@meterio/scan-db/dist';
import { BigNumber } from '@meterio/scan-db/dist';
import * as Logger from 'bunyan';

import { TxBlockReviewer } from './blockReviewer';

export class ScriptEngineCMD extends TxBlockReviewer {
  protected auctionRepo = new AuctionRepo();
  protected auctionSummaryRepo = new AuctionSummaryRepo();
  protected bidRepo = new BidRepo();
  protected epochRewardRepo = new EpochRewardRepo();
  protected epochRewardSummaryRepo = new EpochRewardSummaryRepo();
  protected validatorRewardRepo = new ValidatorRewardRepo();
  protected knownRepo = new KnownRepo();

  constructor(net: Network) {
    super(net);
    this.name = 'scriptengine';
    this.logger = Logger.createLogger({ name: this.name });
  }

  public async cleanUpIncompleteData(head: any): Promise<void> {
    const blockNum = head.num;
    const auction = await this.auctionRepo.deleteAfter(blockNum);
    const bid = await this.bidRepo.deleteAfter(blockNum);
    const auctionSummary = await this.auctionSummaryRepo.deleteAfter(blockNum);
    const epochReward = await this.epochRewardRepo.deleteAfter(blockNum);
    const epochRewardSummary = await this.epochRewardSummaryRepo.deleteAfter(blockNum);
    this.logger.info(
      {
        auction,
        auctionSummary,
        bid,
        epochReward,
        epochRewardSummary,
      },
      `deleted dirty data higher than head ${blockNum}`
    );
  }

  async processTx(tx: Tx, txIndex: number, blk: Block) {
    const epoch = blk.epoch;
    const blockNum = blk.number;
    if (tx.reverted) {
      return;
    }
    const se = devkit.ScriptEngine;
    // process outputs
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      const clause = tx.clauses[clauseIndex];

      if (!clause) {
        console.log('clause is EMPTY: ', tx.hash, ', txIndex=', txIndex, ', clauseIndex=', clauseIndex);
        continue;
      }
      if (!se.IsScriptEngineData(clause.data)) {
        this.logger.info(`skip non-scriptengine tx ${tx.hash}`);
        continue;
      }
      const scriptData = se.decodeScriptData(clause.data);
      this.logger.info(`start to process scriptengine tx ${tx.hash}`);
      if (scriptData.header.modId === se.ModuleID.Auction) {
        if (process.env.ENABLE_AUCTION === 'false') {
          continue;
        }
        // auction
        const body = se.decodeAuctionBody(scriptData.payload);
        // this.logger.info({ opCode: body.opCode }, 'handle auction data');
        switch (body.opCode) {
          case se.AuctionOpCode.End:
            // end auction
            this.logger.info('handle auction end');
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

            const dists: AuctionDist[] = endedAuction.distMTRG.map((d) => ({
              address: d.addr,
              amount: new BigNumber(d.amount),
              token: Token.MTRG,
            }));
            const txs: AuctionTx[] = endedAuction.auctionTxs.map((t) => ({ ...t }));

            // upsert auction summary
            const sExist = await this.auctionSummaryRepo.existID(endedAuction.auctionID);
            if (!sExist) {
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
            }

            // update bids
            let autobidTotal = new BigNumber(0);
            let userbidTotal = new BigNumber(0);
            for (const [i, t] of txs.entries()) {
              // const d = dists[i];
              const bid = await this.bidRepo.findById(t.txid);
              if (!bid) {
                console.log('Bid not found! probably missed one bid');
                continue;
              }
              // if (bid.address.toLowerCase() !== d.address.toLowerCase()) {
              //   console.log('Address mismatch! probably the order is different');
              //   continue;
              // }
              bid.pending = false;
              bid.hammerPrice = new BigNumber(endedAuction.actualPrice);
              bid.lotAmount = new BigNumber(t.amount).dividedBy(endedAuction.actualPrice);
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
            console.log(`ended auction ${tgtAuction}`);
            break;
          case se.AuctionOpCode.Start:
            this.logger.info('handle auction start');
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
            console.log(`started auction ${auction.id}`);
            break;
          case se.AuctionOpCode.Bid:
            // TODO: handle the tx reverted case
            // auction bid

            this.logger.info('handle auction bid');
            const atx = se.getAuctionTxFromAuctionBody(body);
            const presentAuction = await this.auctionRepo.findPresent();
            const bid: Bid = {
              id: atx.ID(),
              address: '0x' + atx.address.toString('hex').toLowerCase(),
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
            console.log(`append bid ${bid.id} to auction ${present.id}`);
            break;
        }
      }

      if (scriptData.header.modId === se.ModuleID.Staking) {
        const body = se.decodeStakingBody(scriptData.payload);
        // this.logger.info({ opCode: body.opCode }, `handle staking data`);

        // handle staking candidate / candidate update
        if (body.opCode === se.StakingOpCode.Candidate || body.opCode === se.StakingOpCode.CandidateUpdate) {
          this.logger.info(`handle staking candidate or candidateUpdate`);
          const pk = body.candidatePubKey.toString();
          const items = pk.split(':::');
          const ecdsaPK = items[0];
          const blsPK = items[1];
          const address = body.candidateAddr.toLowerCase();

          const exist = await this.knownRepo.exist(ecdsaPK);
          if (!exist) {
            const known: Known = {
              ecdsaPK,
              blsPK,
              name: body.candidateName.toString(),
              description: body.candidateDescription.toString(),
              address,
              ipAddress: body.candidateIP.toString(),
              port: body.candidatePort,
            };
            await this.knownRepo.create(known);
          } else {
            let known = await this.knownRepo.findByECDSAPK(ecdsaPK);
            let updated = false;
            if (body.candidateName.toString() != '') {
              known.name = body.candidateName.toString();
              updated = true;
            }
            if (body.candidateAddr.toString() != '') {
              known.address = '0x' + body.candidateAddr.toLowerCase();
              updated = true;
            }
            if (body.candidateIP.toString() != '') {
              known.ipAddress = body.candidateIP.toString();
              updated = true;
            }
            if (body.candidatePort.toString() != '') {
              known.port = body.candidatePort;
              updated = true;
            }
            if (updated) {
              await known.save();
            }
          }
        }

        // handle staking governing
        if (body.opCode === se.StakingOpCode.Governing) {
          this.logger.info(`handle staking governing`);
          let autobidTotal = new BigNumber(0);
          let transferTotal = new BigNumber(0);
          let autobidCount = 0;
          let transferCount = 0;
          const prePresent = await this.pos.getPresentAuctionByRevision(blockNum - 1);
          const present = await this.pos.getPresentAuctionByRevision(blockNum);
          let visited = {};
          for (const atx of prePresent.auctionTxs) {
            visited[atx.txid] = true;
          }
          for (const atx of present.auctionTxs) {
            if (atx.type != 'autobid') {
              continue;
            }
            if (atx.txid in visited) {
              continue;
            }
            const savedBid = await this.bidRepo.findById(atx.txid);
            let reward: EpochReward = {
              epoch,
              blockNum,
              txHash: tx.hash,
              clauseIndex,
              bidID: atx.txid,

              address: atx.address,
              amount: new BigNumber(atx.amount),
              type: 'autobid',
            };
            if (savedBid) {
              reward.txHash = savedBid.txHash;
              reward.clauseIndex = savedBid.clauseIndex;
            }
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

          // upsert validator rewards
          const vExist = await this.validatorRewardRepo.existEpoch(epoch);
          const rewards: RewardInfo[] = vreward.rewards.map((info) => {
            return { amount: new BigNumber(info.amount), address: info.address };
          });
          if (!vExist) {
            await this.validatorRewardRepo.create({
              epoch: epoch,
              baseReward: new BigNumber(vreward.baseReward),
              totalReward: new BigNumber(vreward.totalReward),
              rewards,
            });
          }

          // update epoch reward summary
          const sExist = await this.epochRewardSummaryRepo.existEpoch(epoch);
          if (!sExist) {
            const epochSummary: EpochRewardSummary = {
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
    this.logger.info(`processed tx ${tx.hash}`);
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
