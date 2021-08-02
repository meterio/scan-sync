import {} from '../utils/utils';

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
import { InterruptedError, Pos, sleep } from '../utils';
import { CMD } from './cmd';

const FASTFORWARD_SAMPLING_INTERVAL = 500;
const SAMPLING_INTERVAL = 2000;
const LOOP_WINDOW = 1000;

export abstract class TxBlockReviewer extends CMD {
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
    this.pos = new Pos(net);
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
    await this.loop();
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
        if (!head) {
          head = await this.headRepo.create(this.name, -1, '0x');
        }
        let headNum = !!head ? head.num : -1;

        const posHead = await this.headRepo.findByKey('pos');
        const localBestNum = !!posHead ? posHead.num - 1 : 0;
        let endNum = headNum + LOOP_WINDOW;
        if (endNum > localBestNum) {
          endNum = localBestNum;
          fastforward = false;
        } else {
          fastforward = true;
        }
        console.log(headNum, endNum);

        if (headNum > endNum) {
          continue;
        }
        this.logger.info(`start review PoS block from number ${headNum} to ${endNum} (best:${localBestNum})`);

        let num = headNum;
        for (;;) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.blockRepo.findBlockWithTxFrom(num);
          if (!blk || blk.number > localBestNum || blk.number > endNum) {
            // update head before exit current loop
            let endBlock = await this.blockRepo.findByNumber(endNum);
            // head = await this.headRepo.update(this.name, endBlock.number, endBlock.hash);
            head.num = endBlock.number;
            head.hash = endBlock.hash;
            await head.save();
            break;
          }
          await this.processBlock(blk);

          // update head

          console.log('after process block, update head to ', blk.number);
          // head = await this.headRepo.update(this.name, blk.number, blk.hash);
          head.num = blk.number;
          head.hash = blk.hash;
          await head.save();
          num = blk.number;
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

  abstract processBlock(blk: Block);
}
