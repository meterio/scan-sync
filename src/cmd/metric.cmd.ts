import { EventEmitter } from 'events';
import { stringify } from 'querystring';

import * as Logger from 'bunyan';
import * as hash from 'object-hash';

import { MetricName, MetricType, Network, ValidatorStatus } from '../const';
import { Validator } from '../model/validator.interface';
import MetricRepo from '../repo/metric.repo';
import ValidatorRepo from '../repo/validator.repo';
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
  { key: MetricName.MTRG_PRICE, type: MetricType.NUM, default: '1' },
  { key: MetricName.MTRG_PRICE_CHANGE, type: MetricType.STRING, default: '0%' },
  { key: MetricName.MTR_PRICE, type: MetricType.NUM, default: '0.5' },
  { key: MetricName.MTR_PRICE_CHANGE, type: MetricType.STRING, default: '0%' },
  { key: MetricName.CANDIDATES, type: MetricType.STRING, default: '[]' },
  { key: MetricName.DELEGATES, type: MetricType.STRING, default: '[]' },
  { key: MetricName.BUCKETS, type: MetricType.STRING, default: '[]' },
  { key: MetricName.JAILED, type: MetricType.STRING, default: '[]' },
  { key: MetricName.CANDIDATE_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.DELEGATE_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.BUCKET_COUNT, type: MetricType.NUM, default: '0' },
  { key: MetricName.JAILED_COUNT, type: MetricType.NUM, default: '0' },
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
}

const every = 1;
const every24h = (3600 * 24) / (SAMPLING_INTERVAL / 1000); // count of index in 24 hours
const every30s = 30 / (SAMPLING_INTERVAL / 1000); // count of index in 30 seconds
const every1m = 60 / (SAMPLING_INTERVAL / 1000); // count of index in 1 minute
const every5m = (60 * 5) / (SAMPLING_INTERVAL / 1000); // count of index in 5 minutes
const every10m = (60 * 10) / (SAMPLING_INTERVAL / 1000); // count of index in 10 minutes
export class MetricCMD extends CMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'metric';
  private logger = Logger.createLogger({ name: this.name });
  private metricRepo = new MetricRepo();
  private pos: Pos;
  private pow = new Pow();
  private coingecko = new Net('https://api.coingecko.com/api/v3/');
  private validatorRepo = new ValidatorRepo();

  private cache = new MetricCache();

  constructor(net: Network) {
    super();
    this.pos = new Pos(new Net(process.env.POS_PROVIDER_URL), net);
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
    }
  }

  private async updatePosInfo(index: number, interval: number) {
    const blk = await this.pos.getBlock('best', 'regular');
    if (!!blk) {
      const seq = blk.number - blk.lastKBlockHeight;
      await this.cache.update(MetricName.POS_BEST, String(blk.number));
      await this.cache.update(MetricName.KBLOCK, String(blk.lastKBlockHeight));
      await this.cache.update(MetricName.SEQ, String(seq));
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

  private async updateValidatorInfo(index: number, interval: number) {
    // update staking/slashing every 5 minutes
    if (index % interval === 0) {
      let cUpdated = false,
        jUpdated = false,
        bUpdated = false,
        dUpdated = false;
      const candidates = await this.pos.getCandidates();
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

      // if delegates/candidates/jailed all exists and any one of them got updated
      if (!!delegates && !!candidates && jailed && (jUpdated || dUpdated || cUpdated)) {
        let vs: { [key: string]: Validator } = {};
        for (const c of candidates) {
          if (!(c.pubKey in vs)) {
            vs[c.pubKey] = {
              ...c,
              ipAddress: c.ipAddr,
              status: ValidatorStatus.CANDIDATE,
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
              commission: d.commission,
              distributors: d.distributors,
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

        // update price/change every 10 minutes
        await this.updateMarketPrice(index, every10m);

        // update candidate/delegate/jailed info
        await this.updateValidatorInfo(index, every1m);

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
