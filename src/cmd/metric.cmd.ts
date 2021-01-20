import { EventEmitter } from 'events';

import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';
import * as hash from 'object-hash';

import {
  KeyPowPoolCoef,
  LockedMeterAddrs,
  LockedMeterGovAddrs,
  MetricName,
  MetricType,
  Network,
  ParamsAddress,
  Token,
  ValidatorStatus,
} from '../const';
import { AuctionDist, AuctionTx } from '../model/Auction.interface';
import { Bid } from '../model/bid.interface';
import { Bucket } from '../model/bucket.interface';
import { Validator } from '../model/validator.interface';
import { RewardInfo } from '../model/ValidatorReward.interface';
import AccountRepo from '../repo/account.repo';
import AuctionRepo from '../repo/auction.repo';
import BidRepo from '../repo/bid.repo';
import BucketRepo from '../repo/bucket.repo';
import MetricRepo from '../repo/metric.repo';
import ValidatorRepo from '../repo/validator.repo';
import ValidatorRewardRepo from '../repo/validatorReward.repo';
import { Net } from '../utils/net';
import { Pos } from '../utils/pos-rest';
import { Pow } from '../utils/pow-rpc';
import { InterruptedError, sleep } from '../utils/utils';
import { CMD } from './cmd';

const SAMPLING_INTERVAL = 3000;
const METRIC_DEFS = [
  { key: MetricName.DIFFICULTY, type: MetricType.BIGNUM, default: '1' },
  { key: MetricName.HASHRATE, type: MetricType.BIGNUM, default: '0' },
  { key: MetricName.EPOCH, type: MetricType.NUM, default: '0' },
  { key: MetricName.SEQ, type: MetricType.NUM, default: '0' },
  { key: MetricName.KBLOCK, type: MetricType.NUM, default: '0' },
  { key: MetricName.POS_BEST, type: MetricType.NUM, default: '0' },
  { key: MetricName.POW_BEST, type: MetricType.NUM, default: '0' },
  { key: MetricName.COST_PARITY, type: MetricType.NUM, default: '0' },
  { key: MetricName.REWARD_PER_DAY, type: MetricType.NUM, default: '0' },

  // Price
  { key: MetricName.MTRG_PRICE, type: MetricType.NUM, default: '1' },
  { key: MetricName.MTRG_PRICE_CHANGE, type: MetricType.STRING, default: '0%' },
  { key: MetricName.MTR_PRICE, type: MetricType.NUM, default: '0.5' },
  { key: MetricName.MTR_PRICE_CHANGE, type: MetricType.STRING, default: '0%' },

  // Bitcoin
  { key: MetricName.BTC_PRICE, type: MetricType.NUM, default: '1' },
  { key: MetricName.BTC_HASHRATE, type: MetricType.NUM, default: '1' },

  // Circulation
  { key: MetricName.MTR_CIRCULATION, type: MetricType.STRING, default: '0' },
  { key: MetricName.MTRG_CIRCULATION, type: MetricType.STRING, default: '0' },

  // Staking
  { key: MetricName.CANDIDATES, type: MetricType.STRING, default: '[]' },
  { key: MetricName.DELEGATES, type: MetricType.STRING, default: '[]' },
  { key: MetricName.BUCKETS, type: MetricType.STRING, default: '[]' },
  { key: MetricName.JAILED, type: MetricType.STRING, default: '[]' },
  { key: MetricName.CANDIDATE_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.DELEGATE_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.BUCKET_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.JAILED_COUNT, type: MetricType.NUM, default: '0' },

  // Validator rewards
  { key: MetricName.VALIDATOR_REWARDS, type: MetricType.STRING, default: '[]' },

  // Stake holder
  { key: MetricName.STAKEHOLDER_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.STAKEHOLDERS, type: MetricType.STRING, default: '0' },

  // Auction
  { key: MetricName.PRESENT_AUCTION, type: MetricType.STRING, default: '{}' },
  { key: MetricName.AUCTION_SUMMARIES, type: MetricType.STRING, default: '[]' },
];

class MetricCache {
  private map: { [key: string]: string } = {};
  private metricRepo = new MetricRepo();

  public async init() {
    const metrics = await this.metricRepo.findByKeys(METRIC_DEFS.map((item) => item.key as string));
    for (const m of metrics) {
      this.map[m.key] = m.value;
    }
    for (const m of METRIC_DEFS) {
      if (!(m.key in this.map)) {
        this.map[m.key] = m.default;
        await this.metricRepo.create(m.key, m.default, m.type);
      }
    }
  }

  public async update(key: string, value: string): Promise<boolean> {
    if (key in this.map && value !== undefined) {
      if (value != this.map[key]) {
        this.map[key] = value;
        console.log(`UPDATE ${key} with ${value}`);
        await this.metricRepo.update(key, value);
        return true;
      }
    }
    return false;
  }

  public get(key: string) {
    if (key in this.map) {
      return this.map[key];
    } else {
      for (const m of METRIC_DEFS) {
        if (m.key === key) {
          return m.default;
        }
      }
    }
    return '';
  }
}

const every = 1;
const every6s = 6 / (SAMPLING_INTERVAL / 1000); // count of index in 1 minute
const every24h = (3600 * 24) / (SAMPLING_INTERVAL / 1000); // count of index in 24 hours
const every30s = 30 / (SAMPLING_INTERVAL / 1000); // count of index in 30 seconds
const every1m = 60 / (SAMPLING_INTERVAL / 1000); // count of index in 1 minute
const every5m = (60 * 5) / (SAMPLING_INTERVAL / 1000); // count of index in 5 minutes
const every10m = (60 * 10) / (SAMPLING_INTERVAL / 1000); // count of index in 10 minutes
const every30m = (60 * 30) / (SAMPLING_INTERVAL / 1000); // count of index in 30 minutes
const every2h = (2 * 60 * 60) / (SAMPLING_INTERVAL / 1000); // count of index in 4 hours
const every4h = (4 * 60 * 60) / (SAMPLING_INTERVAL / 1000); // count of index in 4 hours
export class MetricCMD extends CMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'metric';
  private logger = Logger.createLogger({ name: this.name });
  private metricRepo = new MetricRepo();
  private pos: Pos;
  private pow: Pow;
  private coingecko = new Net('https://api.coingecko.com/api/v3/');
  private blockchainInfo = new Net('https://blockchain.info/');
  private validatorRepo = new ValidatorRepo();
  private bucketRepo = new BucketRepo();
  private accountRepo = new AccountRepo();
  private bidRepo = new BidRepo();
  private auctionRepo = new AuctionRepo();
  private validatorRewardRepo = new ValidatorRewardRepo();

  private cache = new MetricCache();

  constructor(net: Network) {
    super();
    this.pow = new Pow(net);
    this.pos = new Pos(net);
  }

  public async beforeStart() {
    for (const m of METRIC_DEFS) {
      const exist = await this.metricRepo.exist(m.key);
      if (!exist) {
        await this.metricRepo.create(m.key, m.default, m.type);
      }
    }

    await this.cache.init();
  }

  public async start() {
    await this.beforeStart();
    this.logger.info('start');
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

  private async updatePowInfo(index: number, interval: number) {
    if (index % interval === 0) {
      const mining = await this.pow.getMiningInfo();
      if (!!mining) {
        await this.cache.update(MetricName.DIFFICULTY, mining.difficulty);
        await this.cache.update(MetricName.HASHRATE, mining.networkhashps);
        await this.cache.update(MetricName.POW_BEST, mining.blocks);
      }
      let efficiency = new BigNumber(0.053);
      try {
        const curCoef = await this.pos.getCurCoef();
        // const coefStorage = await this.pos.getStorage(ParamsAddress, KeyPowPoolCoef);
        // console.log('Coef Storage:', coefStorage);
        // if (!!coefStorage && coefStorage.value) {
        if (!!curCoef) {
          const coef = parseInt(curCoef.toString());
          efficiency = new BigNumber(coef)
            .dividedBy(1e6)
            .times(300 * 120)
            .dividedBy(2 ** 32);
        }
      } catch (e) {}

      console.log(`efficiency: ${efficiency.toFixed()}`);
      const btcHashrate = this.cache.get(MetricName.BTC_HASHRATE);
      const btcPrice = this.cache.get(MetricName.BTC_PRICE);
      const rewardPerDay = new BigNumber(efficiency).dividedBy(10).times(24);
      const costParity = new BigNumber(6.25) // bitcoin reward
        .times(24 * 6)
        .times(1000)
        .times(btcPrice)
        .dividedBy(btcHashrate)
        .dividedBy(rewardPerDay);
      console.log(`rewardPerDay: ${rewardPerDay.toFixed()}, cost parity: ${costParity}`);
      await this.cache.update(MetricName.COST_PARITY, costParity.toFixed());
      await this.cache.update(MetricName.REWARD_PER_DAY, rewardPerDay.toFixed());
    }
  }

  private async updatePosInfo(index: number, interval: number) {
    const blk = await this.pos.getBlock('best', 'regular');
    if (!!blk) {
      const seq = blk.number - blk.lastKBlockHeight;
      await this.cache.update(MetricName.POS_BEST, String(blk.number));
      await this.cache.update(MetricName.KBLOCK, String(blk.lastKBlockHeight));
      await this.cache.update(MetricName.SEQ, String(seq));
      let epoch = 0;
      if (blk.lastKBlockHeight + 1 === blk.number) {
        epoch = blk.epoch;
      } else {
        epoch = blk.qc.epochID;
      }
      if (epoch > 0) {
        await this.cache.update(MetricName.EPOCH, String(epoch));
      }
    }
  }

  private async updateValidatorRewards(index: number, interval: number) {
    const rwds = await this.pos.getValidatorRewards();
    if (!!rwds) {
      const updated = await this.cache.update(MetricName.VALIDATOR_REWARDS, JSON.stringify(rwds));
      if (!updated) {
        return;
      }
      for (const r of rwds) {
        const exist = await this.validatorRewardRepo.existEpoch(r.epoch);
        if (exist) {
          continue;
        }
        let rewards: RewardInfo[] = r.rewards.map((info) => {
          return { amount: new BigNumber(info.amount), address: info.address };
        });
        await this.validatorRewardRepo.create({
          epoch: r.epoch,
          baseReward: new BigNumber(r.baseReward),
          totalReward: new BigNumber(r.totalReward),
          rewards,
        });
      }
    }
  }

  private async updateBitcoinInfo(index: number, interval: number) {
    if (index % interval === 0) {
      //blockchain.info/q/hashrate
      const hashrate = await this.blockchainInfo.http<any>('GET', 'q/hashrate');
      console.log('BTC Hashrate:', hashrate);
      if (!!hashrate) {
        this.cache.update(MetricName.BTC_HASHRATE, String(hashrate));
      }
      const price = await this.coingecko.http<any>('GET', 'simple/price', {
        query: { ids: 'bitcoin', vs_currencies: 'usd', include_24hr_change: 'false' },
      });

      if (!!price && price.bitcoin) {
        console.log('BTC Price', price.bitcoin);
        this.cache.update(MetricName.BTC_PRICE, String(price.bitcoin.usd));
      }
    }
  }

  private async updateMarketPrice(index: number, interval: number) {
    if (index % interval === 0) {
      const price = await this.coingecko.http<any>('GET', 'simple/price', {
        query: { ids: 'meter,meter-stable', vs_currencies: 'usd,usd', include_24hr_change: 'true' },
      });
      if (!!price) {
        if (price.meter) {
          const m = price.meter;
          const percent20h = Math.floor(parseFloat(m.usd_24h_change) * 100) / 100;
          this.cache.update(MetricName.MTRG_PRICE, String(m.usd));
          this.cache.update(MetricName.MTRG_PRICE_CHANGE, `${percent20h}%`);
        }
        if (price['meter-stable']) {
          const m = price['meter-stable'];
          const percent20h = Math.floor(parseFloat(m.usd_24h_change) * 100) / 100;
          this.cache.update(MetricName.MTR_PRICE, String(m.usd));
          this.cache.update(MetricName.MTR_PRICE_CHANGE, `${percent20h}%`);
        }
      }
    }
  }

  private async updateAuctionInfo(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('UPDATE AUCTION');
      let sUpdated = false,
        pUpdated = false;
      const present = await this.pos.getPresentAuction();
      const summaries = await this.pos.getAuctionSummaries();
      if (!!present) {
        pUpdated = await this.cache.update(MetricName.PRESENT_AUCTION, JSON.stringify(present));
      }
      if (!!summaries) {
        sUpdated = await this.cache.update(MetricName.AUCTION_SUMMARIES, JSON.stringify(summaries));
      }

      if (sUpdated) {
        for (const s of summaries) {
          const exist = await this.auctionRepo.findByID(s.auctionID);
          if (!exist) {
            let dists: AuctionDist[] = [];
            let txs: AuctionTx[] = [];
            let bids: Bid[] = [];
            for (const d of s.distMTRG) {
              dists.push({
                address: d.addr,
                amount: new BigNumber(d.amount),
                token: Token.MTRG,
              });
            }
            for (const t of s.auctionTxs) {
              txs.push({ ...t });
              bids.push({ ...t, auctionID: s.auctionID });
            }
            await this.auctionRepo.create({
              id: s.auctionID,
              startHeight: s.startHeight,
              startEpoch: s.startEpoch,
              endHeight: s.endHeight,
              endEpoch: s.endEpoch,
              createTime: s.createTime,
              releasedMTRG: new BigNumber(s.releasedMTRG),
              reservedMTRG: new BigNumber(s.reservedMTRG),
              reservedPrice: new BigNumber(s.reservedPrice),
              receivedMTR: new BigNumber(s.receivedMTR),
              actualPrice: new BigNumber(s.actualPrice),
              txs,
              distMTRG: dists,
            });
            await this.bidRepo.bulkInsert(...bids);
          }
        }
      }
    }
  }

  private async updateStakingInfo(index: number, interval: number) {
    // update staking/slashing every 5 minutes
    if (index % interval === 0) {
      let cUpdated = false,
        jUpdated = false,
        bUpdated = false,
        dUpdated = false,
        sUpdated = false;
      const candidates = await this.pos.getCandidates();
      const stakeholders = await this.pos.getStakeholders();
      if (!!candidates) {
        cUpdated = await this.cache.update(MetricName.CANDIDATES, JSON.stringify(candidates));
        await this.cache.update(MetricName.CANDIDATE_COUNT, `${candidates.length}`);
      }
      const buckets = await this.pos.getBuckets();
      if (!!buckets) {
        bUpdated = await this.cache.update(MetricName.BUCKETS, JSON.stringify(buckets));
        await this.cache.update(MetricName.BUCKET_COUNT, `${buckets.length}`);
      }
      const jailed = await this.pos.getJailed();
      if (!!jailed) {
        jUpdated = await this.cache.update(MetricName.JAILED, JSON.stringify(jailed));
        await this.cache.update(MetricName.JAILED_COUNT, `${jailed.length}`);
      }
      const delegates = await this.pos.getDelegates();
      if (!!delegates) {
        dUpdated = await this.cache.update(MetricName.DELEGATES, JSON.stringify(delegates));
        await this.cache.update(MetricName.DELEGATE_COUNT, `${delegates.length}`);
      }
      if (!!stakeholders) {
        sUpdated = await this.cache.update(MetricName.STAKEHOLDERS, JSON.stringify(stakeholders));
        await this.cache.update(MetricName.STAKEHOLDER_COUNT, `${stakeholders.length}`);
      }

      // if delegates/candidates/jailed all exists and any one of them got updated
      if (!!delegates && !!candidates && jailed && (jUpdated || dUpdated || cUpdated)) {
        let vs: { [key: string]: Validator } = {};
        for (const c of candidates) {
          if (!(c.pubKey in vs)) {
            vs[c.pubKey] = {
              ...c,
              ipAddress: c.ipAddr,
              status: ValidatorStatus.CANDIDATE,
              totalVotes: new BigNumber(c.totalVotes),
            };
          } else {
            // duplicate pubkey
            // TODO: handle this
          }
        }
        for (const d of delegates) {
          if (d.pubKey in vs) {
            let can = vs[d.pubKey];
            vs[d.pubKey] = {
              ...can,
              delegateCommission: d.commission,
              distributors: d.distributors,
              votingPower: new BigNumber(d.votingPower),
              status: ValidatorStatus.DELEGATE,
            };
          } else {
            // delegate key is not in candiate list?
            // TODO: handle this
          }
        }

        for (const j of jailed) {
          if (j.pubKey in vs) {
            let can = vs[j.pubKey];
            vs[j.pubKey] = {
              ...can,
              jailedTime: j.jailedTime,
              totalPoints: j.totalPoints,
              bailAmount: j.bailAmount,
              status: ValidatorStatus.JAILED,
            };
          } else {
            // jailed key not in candiate list ?
            // TODO: handle this
          }
        }

        await this.validatorRepo.deleteAll();
        await this.validatorRepo.bulkInsert(...Object.values(vs));
      }

      // refresh bucket collection if updated
      if (bUpdated) {
        const buckets = await this.pos.getBuckets();
        const bkts: Bucket[] = [];

        for (const b of buckets) {
          bkts.push({
            ...b,
            value: new BigNumber(b.value),
            bonusVotes: new BigNumber(b.bonusVotes),
            totalVotes: new BigNumber(b.totalVotes),
          });
        }
        await this.bucketRepo.deleteAll();
        await this.bucketRepo.bulkInsert(...bkts);
      }
    }
  }

  private async updateCirculationAndRank(index: number, interval: number) {
    if (index % interval === 0) {
      // Update circulation
      const accts = await this.accountRepo.findAll();
      let mtr = new BigNumber(0);
      let mtrg = new BigNumber(0);
      for (const acct of accts) {
        if (!(acct.address in LockedMeterAddrs) && acct.mtrBalance.isGreaterThan(0)) {
          mtr = mtr.plus(acct.mtrBalance);
        }
        if (!(acct.address in LockedMeterGovAddrs) && acct.mtrgBalance.isGreaterThan(0)) {
          mtrg = mtrg.plus(acct.mtrgBalance);
        }
      }
      console.log('MTR Circulation: ', mtr.toFixed());
      await this.cache.update(MetricName.MTR_CIRCULATION, mtr.toFixed());
      console.log('MTRG Circulation: ', mtr.toFixed());
      await this.cache.update(MetricName.MTRG_CIRCULATION, mtrg.toFixed());

      // Update rank information
      const mtrRanked = accts.sort((a, b) => {
        return a.mtrBalance.isGreaterThan(b.mtrBalance) ? -1 : 1;
      });
      for (const [i, a] of mtrRanked.entries()) {
        if (a.mtrRank !== i + 1) {
          await this.accountRepo.updateMTRRank(a.address, i + 1);
        }
      }

      const mtrgRanked = accts.sort((a, b) => {
        return a.mtrgBalance.isGreaterThan(b.mtrgBalance) ? -1 : 1;
      });
      for (const [i, a] of mtrgRanked.entries()) {
        if (a.mtrgRank !== i + 1) {
          await this.accountRepo.updateMTRGRank(a.address, i + 1);
        }
      }
    }
  }

  public async loop() {
    let index = 0;

    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);
        this.logger.info('collect metrics');

        // update pos best, difficulty && hps
        await this.updatePowInfo(index, every10m);

        // update pos best, kblock & seq
        await this.updatePosInfo(index, every);

        // update bitcoin info every 5seconds
        await this.updateBitcoinInfo(index, every10m);

        // update price/change every 10 minutes
        await this.updateMarketPrice(index, every10m);

        // update circulation
        await this.updateCirculationAndRank(index, every4h);

        // update candidate/delegate/jailed info
        await this.updateStakingInfo(index, every5m);

        // update auction info
        await this.updateAuctionInfo(index, every5m);

        // update validator rewards
        await this.updateValidatorRewards(index, every5m);

        index = (index + 1) % every24h; // clear up 24hours
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
}
