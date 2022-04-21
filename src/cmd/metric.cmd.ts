import { EventEmitter } from 'events';

import {
  AccountRepo,
  AlertRepo,
  BlockRepo,
  Bucket,
  BucketRepo,
  ContractRepo,
  HeadRepo,
  Network,
  Validator,
  ValidatorRepo,
  ValidatorStatus,
  BigNumber,
  ABIFragment,
  ABIFragmentRepo,
  ContractFile,
  ContractFileRepo,
  getNetworkConstants,
} from '@meterio/scan-db/dist';
import { toChecksumAddress } from '@meterio/devkit/dist/cry';
import Logger from 'bunyan';

import { LockedMeterAddrs, LockedMeterGovAddrs, MetricName } from '../const';
import { InterruptedError, Net, Pos, Pow, sleep } from '../utils';
import { MetricCache } from '../types';
import { postToSlackChannel } from '../utils/slack';
import { CMD } from './cmd';
import axios from 'axios';
import { EventFragment, FormatTypes, FunctionFragment, Interface } from 'ethers/lib/utils';

const SAMPLING_INTERVAL = 3000;

const SOURCIFY_SERVER_API = 'https://sourcify.dev/server';

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
  private headRepo = new HeadRepo();
  private contractRepo = new ContractRepo();
  private abiFragmentRepo = new ABIFragmentRepo();
  private contractFileRepo = new ContractFileRepo();

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
      const bestBlock = await this.pos.getBlock('best', 'regular');
      const recentBlks = await this.blockRepo.findRecent();
      if (recentBlks && recentBlks.length > 0) {
        const head = recentBlks[0];
        if (head.number !== bestBlock.number) {
          return;
        }
        console.log('head: ', head.number);
        const now = Math.floor(Date.now() / 1000);
        console.log('now', now);
        console.log(head.timestamp);
        console.log(now - head.timestamp);
        if (now - head.timestamp > 120) {
          // alert
          const netName = Network[this.network];
          const channel = 'slack';
          const msg = `network ${netName} halted for over 2 minutes at epoch:${head.epoch} and number:${head.number}`;
          await this.checkOrSendAlert(netName, head.epoch, head.number, channel, msg);
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
      const present = await this.pos.getPresentAuction();
      const summaries = await this.pos.getAuctionSummaries();
      if (!!present) {
        await this.cache.update(MetricName.PRESENT_AUCTION, JSON.stringify(present));
      }
      if (!!summaries) {
        await this.cache.update(MetricName.AUCTION_SUMMARIES, JSON.stringify(summaries));
      }
    }
  }

  private async updateInvalidNodes(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('update invalid nodes');
      try {
        let invalidNodes = [];
        const validators = await this.validatorRepo.findAll();
        for (const v of validators) {
          let probe: Pos.ProbeInfo;
          try {
            probe = await this.pos.probe(v.ipAddress);
          } catch (e) {
            console.log(e);
            console.log(`could not probe ${v.ipAddress}`);
            invalidNodes.push({ name: v.name, ip: v.ipAddress, reason: 'could not probe' });
            continue;
          }
          console.log(`got probe for ${v.ipAddress}`);
          if (!(probe.isCommitteeMember && probe.isPacemakerRunning)) {
            invalidNodes.push({ name: v.name, ip: v.ipAddress, reason: 'in committee without pacemaker running' });
            continue;
          }
          if (!probe.pubkeyValid) {
            invalidNodes.push({ name: v.name, ip: v.ipAddress, reason: 'invalid pubkey' });
            continue;
          }
          const headHeight = Number(this.cache.get(MetricName.POS_BEST));
          if (headHeight - probe.bestBlock.number > 3) {
            invalidNodes.push({ name: v.name, ip: v.ipAddress, reason: 'fall behind' });
          }
        }
        console.log('update invalid nodes');
        await this.cache.update(MetricName.INVALID_NODES, JSON.stringify(invalidNodes));
        await this.cache.update(MetricName.INVALID_NODES_COUNT, `${invalidNodes.length}`);
      } catch (e) {
        console.log('could not query pos height: ', e);
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

  private async updateVerifiedContracts(index: number, interval: number) {
    if (index % interval === 0) {
      console.log('UPDATE VERIFIED CONTRACT');
      const netConsts = getNetworkConstants(this.network);
      const chainId = netConsts.chainId;
      if (!chainId) {
        console.log('could not get correct chainId to check verified contracts');
        return;
      }

      const res = await axios.get(`${SOURCIFY_SERVER_API}/files/contracts/${chainId}`);
      const addresses = res.data.full.map((s) => s.toLowerCase()).concat(res.data.partial.map((s) => s.toLowerCase()));
      console.log(addresses);
      const unverified = await this.contractRepo.findUnverifiedContracts(addresses);
      console.log('unverified: ', unverified);

      for (const c of unverified) {
        const addr = toChecksumAddress(c.address);
        const fileRes = await axios.get(`${SOURCIFY_SERVER_API}/files/any/${chainId}/${addr}`);
        const { data } = fileRes;
        c.verified = true;
        c.status = data.status;

        let contractFiles: ContractFile[] = [];
        for (const file of data.files) {
          contractFiles.push({
            ...file,
            address: c.address,
          } as ContractFile);

          if (file.name === 'metadata.json') {
            // decode metadata

            const meta = JSON.parse(file.content);
            const abis = meta.output.abi;

            let fragments: ABIFragment[] = [];
            const iface = new Interface(abis);
            const funcMap = iface.functions;
            const evtMap = iface.events;
            for (const key in funcMap) {
              const funcFragment = funcMap[key];
              const name = funcFragment.name;
              const abi = funcFragment.format(FormatTypes.full);
              const signature = iface.getSighash(funcFragment);
              fragments.push({ name, signature, abi, type: 'function' });
            }
            for (const key in evtMap) {
              const evtFragment = evtMap[key];
              const name = evtFragment.name;
              const abi = evtFragment.format(FormatTypes.full);
              const signature = iface.getEventTopic(evtFragment);
              fragments.push({ name, signature, abi, type: 'event' });
            }

            console.log('fragments: ', fragments);

            await this.abiFragmentRepo.bulkUpsert(...fragments);
          }
        }
        console.log(
          'contract files: ',
          contractFiles.map((c) => ({ name: c.name, path: c.path }))
        );
        await this.contractFileRepo.bulkUpsert(...contractFiles);
        await c.save();
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

        // update verified contracts from sourcify
        if (process.env.ENABLE_SOURCIFY === 'true') {
          await this.updateVerifiedContracts(index, every4h);
        }

        // update pos best, difficulty && hps
        await this.updatePowInfo(index, every10m);

        // update pos best, kblock & seq
        await this.updatePosInfo(index, every);

        // check network, if halt for 2 mins, send alert
        await this.alertIfNetworkHalt(index, every1m);

        // update bitcoin info every 5 minutes
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
        if (process.env.ENABLE_AUCTION === 'true') {
          await this.updateAuctionInfo(index, every5m);
        }

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
