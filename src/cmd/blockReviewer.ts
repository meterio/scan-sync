import { EventEmitter } from 'events';

import * as Logger from 'bunyan';

import { Network } from '../const';
import { Block } from '../model/block.interface';
import AccountRepo from '../repo/account.repo';
import BlockRepo from '../repo/block.repo';
import CommitteeRepo from '../repo/committee.repo';
import HeadRepo from '../repo/head.repo';
import TransferRepo from '../repo/transfer.repo';
import TxRepo from '../repo/tx.repo';
import { Net } from '../utils/net';
import { Pos } from '../utils/pos-rest';
import { InterruptedError, sleep } from '../utils/utils';
import { CMD } from './cmd';

const SAMPLING_INTERVAL = 500;

export abstract class BlockReviewer extends CMD {
  protected shutdown = false;
  protected ev = new EventEmitter();
  protected name = '-';
  protected logger: Logger;
  protected network: Network;
  protected pos: Pos;

  protected headRepo = new HeadRepo();
  protected txRepo = new TxRepo();
  protected blockRepo = new BlockRepo();
  protected accountRepo = new AccountRepo();
  protected transferRepo = new TransferRepo();
  protected committeeRepo = new CommitteeRepo();

  constructor(net: Network) {
    super();
    this.logger = Logger.createLogger({ name: this.name });
    this.network = net;
    this.pos = new Pos(new Net(process.env.POS_PROVIDER_URL), net);
  }

  protected async processGenesis(): Promise<void> {
    return;
  }

  public async beforeStart() {
    let head = await this.headRepo.findByKey(this.name);
    if (!head || head.num === 0) {
      await this.processGenesis();
      const genesis = await this.blockRepo.findByNumber(0);
      if (!head) {
        await this.headRepo.create(this.name, 0, genesis.hash);
      } else {
        await this.headRepo.update(this.name, 0, genesis.hash);
      }
    }
  }

  public async start() {
    await this.beforeStart();
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

  public async loop() {
    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);
        let head = await this.headRepo.findByKey(this.name);
        let headNum = !!head ? head.num : -1;

        const posHead = await this.headRepo.findByKey('pos');
        const localBestNum = !!posHead ? posHead.num - 1 : 0;

        const tgtNum = localBestNum - headNum > 1000 ? headNum + 1000 : localBestNum;
        if (tgtNum <= headNum) {
          continue;
        }
        this.logger.info(`start review PoS block from number ${headNum + 1} to ${tgtNum}`);

        for (let num = headNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.blockRepo.findByNumber(num);
          await this.processBlock(blk);
          this.logger.info({ number: blk.number, hash: blk.hash }, `reviewed block`);

          // update head
          if (!head) {
            head = await this.headRepo.create(this.name, blk.number, blk.hash);
          } else {
            head = await this.headRepo.update(this.name, blk.number, blk.hash);
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

  abstract async processBlock(blk: Block);
}
