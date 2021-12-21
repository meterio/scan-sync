import { EventEmitter } from 'events';

import axios from 'axios';
import BigNumber from 'bignumber.js';
import Logger from 'bunyan';

import { LockedMeterAddrs, LockedMeterGovAddrs, MetricName, Network, Token, ValidatorStatus } from '../const';
import { Bucket } from '../model/bucket.interface';
import { Validator } from '../model/validator.interface';
import AccountRepo from '../repo/account.repo';
import AlertRepo from '../repo/alert.repo';
import BlockRepo from '../repo/block.repo';
import BucketRepo from '../repo/bucket.repo';
import MetricRepo from '../repo/metric.repo';
import ValidatorRepo from '../repo/validator.repo';
import { InterruptedError, Net, Pos, Pow, sleep } from '../utils';
import { MetricCache } from '../utils/metricCache';
import { postToSlackChannel } from '../utils/slack';
import { CMD } from './cmd';

const SAMPLING_INTERVAL = 3000;

const every = 1;
const every6s = 6 / (SAMPLING_INTERVAL / 1000); // count of index in 1 minute
const every24h = (3600 * 24) / (SAMPLING_INTERVAL / 1000); // count of index in 24 hours
const every30s = 30 / (SAMPLING_INTERVAL / 1000); // count of index in 30 seconds
const every1m = 60 / (SAMPLING_INTERVAL / 1000); // count of index in 1 minute
const every2m = (60 * 2) / (SAMPLING_INTERVAL / 1000); // count of index in 3 minute
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
  private network: Network;
  private coingecko = new Net('https://api.coingecko.com/api/v3/');
  private blockchainInfo = new Net('https://api.blockchain.info');
  private validatorRepo = new ValidatorRepo();
  private bucketRepo = new BucketRepo();
  private accountRepo = new AccountRepo();
  private blockRepo = new BlockRepo();
  private alertRepo = new AlertRepo();

  private cache = new MetricCache();

  constructor(net: Network) {
    super();
    this.pow = new Pow(net);
    this.pos = new Pos(net);
    this.network = net;
  }

  public async beforeStart() {
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
      console.log('update PoW info');
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
          await this.cache.update(MetricName.COEF, efficiency.toFixed());
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
    if (index % interval === 0) {
      console.log('update PoS info');
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
  }

  private async checkOrSendAlert(network: string, epoch: number, number: number, channel: string, msg: string) {
    const exist = await this.alertRepo.existMsg(network, epoch, number, channel, msg);
    if (!exist) {
      try {
        console.log(network);
        await this.alertRepo.create({ network, epoch, number, channel, msg });
        await postToSlackChannel({ text: msg });
      } catch (e) {
        console.log('could not send alert', e);
      }
    }
  }

  private async alertIfNetworkHalt(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('check if network halted');
      const recentBlks = await this.blockRepo.findRecent();
      if (recentBlks && recentBlks.length > 0) {
        const head = recentBlks[0];
        console.log('head: ', head.number);
        const now = Math.floor(Date.now() / 1000);
        console.log('now', now);
        console.log(head.createdAt);
        console.log(now - head.createdAt);
        if (now - head.createdAt > 120) {
          // alert
          let network = '';
          switch (this.network) {
            case Network.MainNet:
              network = 'mainnet';
              break;
            case Network.TestNet:
              network = 'testnet';
              break;
            case Network.DevNet:
              network = 'devnet';
              break;
            default:
              network = 'devnet';
              break;
          }
          const channel = 'slack';
          const msg = `network ${network} halted for over 2 minutes at epoch:${head.epoch} and number:${head.number}`;
          await this.checkOrSendAlert(network, head.epoch, head.number, channel, msg);
        }
      }
    }
  }

  private async updateValidatorRewards(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('update validate rewards');
      const rwds = await this.pos.getValidatorRewards();
      if (!!rwds) {
        const updated = await this.cache.update(MetricName.VALIDATOR_REWARDS, JSON.stringify(rwds));
        if (!updated) {
          return;
        }
      }
    }
  }

  private async updateBitcoinInfo(index: number, interval: number) {
    if (index % interval === 0) {
      //blockchain.info/q/hashrate
      console.log('update Bitcoin info');
      const stats = await this.blockchainInfo.http<any>('GET', 'stats');
      console.log('BTC Hashrate:', stats.hash_rate);
      if (!!stats) {
        this.cache.update(MetricName.BTC_HASHRATE, String(stats.hash_rate));
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
      console.log('update market price');
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
      console.log('update auction info');
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
    }
  }

  private async updateInvalidNodes(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('update invalid nodes');
      try {
        let invalidNodes = [];
        const res = await axios.get(`http://monitor.meter.io:9090/api/v1/query?query=best_height`);
        let job = '';
        switch (this.network) {
          case Network.MainNet:
            job = 'mainnet_metrics';
            break;
          case Network.TestNet:
            job = 'shoal_metrics';
            break;
          default:
            console.log('incorrect network setting for network status update');
            return;
        }
        let bests = res.data.data.result
          .filter((r) => r.metric.job === job)
          .map((r) => ({ ip: r.metric.instance, name: r.metric.name, height: r.value[1] }));
        const headHeight = Number(this.cache.get(MetricName.POS_BEST));
        const validators = await this.validatorRepo.findAll();
        let visited = {};
        for (const v of validators) {
          let found = false;
          if (visited[v.ipAddress]) {
            continue;
          }
          visited[v.ipAddress] = true;
          for (const b of bests) {
            if (v.ipAddress === b.ip) {
              found = true;
              if (Math.abs(headHeight - b.height) > 3) {
                // too far away from current height
                invalidNodes.push({
                  name: v.name,
                  ip: v.ipAddress,
                  reason: 'fall behind',
                });
              }
            }
          }
          if (!found) {
            invalidNodes.push({
              name: v.name,
              ip: v.ipAddress,
              reason: 'not monitored',
            });
          }
        }

        console.log('update invalid nodes');
        await this.cache.update(MetricName.INVALID_NODES, JSON.stringify(invalidNodes));
        await this.cache.update(MetricName.INVALID_NODES_COUNT, `${invalidNodes.length}`);
      } catch (e) {
        console.log('could not query pos height');
      }
    }
  }

  private async updateSlashingInfo(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('update slashing info');
      let updated = false;
      const stats = await this.pos.getValidatorStats();
      if (!!stats) {
        updated = await this.cache.update(MetricName.STATS, JSON.stringify(stats));
      }
      if (updated) {
        try {
          await this.validatorRepo.emptyPenaltyPoints();
          const vs = await this.validatorRepo.findAll();
          let statMap = {};
          for (const stat of stats) {
            statMap[stat.address] = stat.totalPoints;
          }

          for (const v of vs) {
            let curTotalPoints = 0;
            if (v.address in statMap) {
              curTotalPoints = statMap[v.address];
            }
            if (v.totalPoints != curTotalPoints) {
              v.totalPoints = curTotalPoints;
              await v.save();
            }
          }
        } catch (e) {
          console.log('could not update penalty points');
        }
      }
    }
  }

  private async updateStakingInfo(index: number, interval: number) {
    // update staking/slashing every 5 minutes
    if (index % interval === 0) {
      console.log('update staking info');
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
      if (!!delegates && !!candidates && !!jailed && (jUpdated || dUpdated || cUpdated)) {
        const statsStr = this.cache.get(MetricName.STATS);
        let statMap = {};
        try {
          const stats = JSON.parse(statsStr);
          for (const stat of stats) {
            statMap[stat.address] = stat.totalPoints;
          }
        } catch (e) {
          console.log('could not parse stats');
        }

        let vs: { [key: string]: Validator } = {}; // address -> validator object
        for (const c of candidates) {
          if (!(c.address in vs)) {
            vs[c.address] = {
              ...c,
              address: c.address.toLowerCase(),
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
          if (d.address in vs) {
            let can = vs[d.address];
            vs[d.address] = {
              ...can,
              address: can.address.toLowerCase(),
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
          if (j.address in vs) {
            let can = vs[j.address];
            vs[j.address] = {
              ...can,
              address: can.address.toLowerCase(),
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

        for (const address in vs) {
          let totalPoints = 0;
          if (address in statMap) {
            totalPoints = statMap[address];
          }
          vs[address].totalPoints = totalPoints;
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
      console.log('update circulation and rank');
      const bucketStr = this.cache.get(MetricName.BUCKETS);
      const buckets = JSON.parse(bucketStr);
      let totalStaked = new BigNumber(0);
      let totalStakedLocked = new BigNumber(0);
      for (const b of buckets) {
        if (b.owner in LockedMeterGovAddrs) {
          totalStakedLocked = totalStakedLocked.plus(b.totalVotes);
        }
        totalStaked = totalStaked.plus(b.totalVotes);
      }
      await this.cache.update(MetricName.MTRG_STAKED, totalStaked.toFixed(0));
      await this.cache.update(MetricName.MTRG_STAKED_LOCKED, totalStakedLocked.toFixed(0));

      const accts = await this.accountRepo.findAll();
      let mtr = new BigNumber(0);
      let mtrg = new BigNumber(0);
      for (const acct of accts) {
        // add mtr balance
        if (!(acct.address in LockedMeterAddrs) && acct.mtrBalance.isGreaterThan(0)) {
          mtr = mtr.plus(acct.mtrBalance);
        }
        // add mtr bounded balance
        if (!(acct.address in LockedMeterAddrs) && acct.mtrBounded && acct.mtrBounded.isGreaterThan(0)) {
          mtr = mtr.plus(acct.mtrBounded);
        }

        // add mtrg balance
        if (!(acct.address in LockedMeterGovAddrs) && acct.mtrgBalance.isGreaterThan(0)) {
          mtrg = mtrg.plus(acct.mtrgBalance);
        }
        // add mtrg bounded balance
        if (!(acct.address in LockedMeterGovAddrs) && acct.mtrgBounded && acct.mtrgBounded.isGreaterThan(0)) {
          mtrg = mtrg.plus(acct.mtrgBounded);
        }
      }
      await this.cache.update(MetricName.MTR_CIRCULATION, mtr.toFixed());
      await this.cache.update(MetricName.MTRG_CIRCULATION, mtrg.toFixed());

      // Update rank information
      const mtrRanked = accts.sort((a, b) => {
        let aTotalMTR = a.mtrBalance;
        let bTotalMTR = b.mtrBalance;
        if (a.mtrBounded) {
          aTotalMTR = aTotalMTR.plus(a.mtrBounded);
        }
        if (b.mtrBounded) {
          bTotalMTR = bTotalMTR.plus(b.mtrBounded);
        }
        return aTotalMTR.isGreaterThan(bTotalMTR) ? -1 : 1;
      });

      for (const [i, a] of mtrRanked.entries()) {
        if (a.mtrRank !== i + 1) {
          await this.accountRepo.updateMTRRank(a.address, i + 1);
        }
      }

      const mtrgRanked = accts.sort((a, b) => {
        let aTotalMTRG = a.mtrgBalance;
        let bTotalMTRG = b.mtrgBalance;
        if (a.mtrgBounded) {
          aTotalMTRG = aTotalMTRG.plus(a.mtrgBounded);
        }
        if (b.mtrgBounded) {
          bTotalMTRG = bTotalMTRG.plus(b.mtrgBounded);
        }
        return aTotalMTRG.isGreaterThan(bTotalMTRG) ? -1 : 1;
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

        // update pos best, difficulty && hps
        // await this.updatePowInfo(index, every10m);

        // update pos best, kblock & seq
        await this.updatePosInfo(index, every);

        // check network, if halt for 2 mins, send alert
        await this.alertIfNetworkHalt(index, every1m);

        // update bitcoin info every 5seconds
        await this.updateBitcoinInfo(index, every5m);

        // update price/change every 10 minutes
        await this.updateMarketPrice(index, every5m);

        // update circulation
        await this.updateCirculationAndRank(index, every4h);

        // update candidate/delegate/jailed info
        await this.updateStakingInfo(index, every1m);

        // update slashing penalty points
        await this.updateSlashingInfo(index, every1m);

        // update network status
        await this.updateInvalidNodes(index, every2m);

        // update auction info
        // await this.updateAuctionInfo(index, every5m);

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
