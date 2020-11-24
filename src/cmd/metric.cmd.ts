import { EventEmitter } from 'events';

import * as Logger from 'bunyan';

import { MetricType, Network } from '../const';
import { Metric } from '../model/metric.interface';
import MetricRepo from '../repo/metric.repo';
import { Net } from '../utils/net';
import { Pos } from '../utils/pos-rest';
import { Pow } from '../utils/pow-rpc';
import { InterruptedError, sleep } from '../utils/utils';
import { CMD } from './cmd';

const SAMPLING_INTERVAL = 3000;
const METRIC_DEFS = [
  { key: 'difficulty', type: MetricType.BIGNUM, default: '1' },
  { key: 'networkhashps', type: MetricType.BIGNUM, default: '0' },
  { key: 'epoch', type: MetricType.NUM, default: '0' },
  { key: 'seq', type: MetricType.NUM, default: '0' },
  { key: 'kblock', type: MetricType.NUM, default: '0' },
  { key: 'posbest', type: MetricType.NUM, default: '0' },
  { key: 'powbest', type: MetricType.NUM, default: '0' },
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
          await this.cache.update('difficulty', mining.difficulty);
          await this.cache.update('networkhashps', mining.networkhashps);
          await this.cache.update('powbest', mining.blocks);
        }

        // update epoch && round
        const blk = await this.pos.getBlock('best', 'regular');
        if (!!blk) {
          const seq = blk.number - blk.lastKBlockHeight;
          await this.cache.update('posbest', String(blk.number));
          await this.cache.update('kblock', String(blk.lastKBlockHeight));
          await this.cache.update('seq', String(seq));
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
}
