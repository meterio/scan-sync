import { EventEmitter } from 'events';
import { stringify } from 'querystring';

import * as Logger from 'bunyan';

import { MetricName, MetricType, Network } from '../const';
import MetricRepo from '../repo/metric.repo';
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
];

class MetricCache {
  private map: { [key: string]: string } = {};
  private metricRepo = new MetricRepo();

  public async init() {
    const metrics = await this.metricRepo.findByKeys(METRIC_DEFS.map((item) => item.key));
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

  public async update(key: string, value: string) {
    if (key in this.map && value !== undefined) {
      if (value != this.map[key]) {
        this.map[key] = value;
        console.log('update ', key, 'to ', value);
        await this.metricRepo.update(key, value);
      }
    }
  }
}

export class MetricCMD extends CMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'metric';
  private logger = Logger.createLogger({ name: this.name });
  private metricRepo = new MetricRepo();
  private pos: Pos;
  private pow = new Pow();
  private coingecko = new Net('https://api.coingecko.com/api/v3/');

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

  public async loop() {
    let index = 0;
    const reset24h = (3600 * 24) / (SAMPLING_INTERVAL / 1000); // count of index in 24 hours
    const reset30s = 30 / (SAMPLING_INTERVAL / 1000); // count of index in 30 seconds
    const reset1m = 60 / (SAMPLING_INTERVAL / 1000); // count of index in 1 minute
    const reset5m = (60 * 5) / (SAMPLING_INTERVAL / 1000); // count of index in 5 minutes
    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);
        this.logger.info('collect metrics');

        // update difficulty && hps
        const mining = await this.pow.getMiningInfo();
        if (!!mining) {
          await this.cache.update(MetricName.DIFFICULTY, mining.difficulty);
          await this.cache.update(MetricName.HASHRATE, mining.networkhashps);
          await this.cache.update(MetricName.POW_BEST, mining.blocks);
        }

        // update epoch && round
        const blk = await this.pos.getBlock('best', 'regular');
        if (!!blk) {
          const seq = blk.number - blk.lastKBlockHeight;
          await this.cache.update(MetricName.POS_BEST, String(blk.number));
          await this.cache.update(MetricName.KBLOCK, String(blk.lastKBlockHeight));
          await this.cache.update(MetricName.SEQ, String(seq));
        }

        // update every minute
        if (index % reset1m === 0) {
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

        index = (index + 1) % reset24h; // clear up 24hours
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
