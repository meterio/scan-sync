import * as Logger from 'bunyan';
import { EventEmitter } from 'events';
import PowBlockRepo from '../repo/powBlock.repo';
import { Pow } from '../utils/pow-rpc';
import { sleep, InterruptedError } from '../utils/utils';
import { PowBlock } from '../model/powBlock.interface';
import PowTxRepo from '../repo/powTx.repo';
import HeadRepo from '../repo/head.repo';
import { CMD } from './cmd';
import { Network } from '../const';

const SAMPLING_INTERVAL = 500;
const PRELOAD_WINDOW = 5;

export class PowCMD extends CMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'pow';
  private logger = Logger.createLogger({ name: this.name });
  private powBlockRepo = new PowBlockRepo();
  private powTxRepo = new PowTxRepo();
  private headRepo = new HeadRepo();
  private pow = new Pow();

  constructor(net: Network) {
    super();
  }

  public async start() {
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

  public async processBlock(blk: PowBlock) {
    if (blk.height > 0) {
      const prevBlock = await this.getBlockFromRPC(blk.height - 1);
      blk.previousBlockHash = prevBlock.hash;
      await this.powBlockRepo.create(blk);
    }
    if (blk.height > 0 && blk.tx && blk.tx.length > 0) {
      for (const txhash of blk.tx) {
        const powTx = await this.pow.getTx(txhash);
        await this.powTxRepo.create(powTx);
      }
    }
    this.logger.info({ height: blk.height, hash: blk.hash }, `processed block: ${blk.height}`);
  }

  private async getBlockFromRPC(num: number) {
    const b = await this.pow.getBlock(num);

    // preload blocks
    (async () => {
      for (let i = 1; i <= PRELOAD_WINDOW; i++) {
        await this.pow.getBlock(num + i);
      }
    })().catch();
    return b;
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

        // delete invalid/incomplete blocks
        const futureBlocks = await this.powBlockRepo.findFutureBlocks(headNum);
        for (const blk of futureBlocks) {
          for (const txHash of blk.tx) {
            await this.powTxRepo.delete(txHash);
            this.logger.info({ txHash }, 'deleted tx in blocks higher than head');
          }
          await this.powBlockRepo.delete(blk.hash);
          this.logger.info({ height: blk.height, hash: blk.hash }, 'deleted block higher than head ');
        }
        const info = await this.pow.getBlockchainInfo();
        const bestNum = info.blocks;
        const tgtNum = bestNum - headNum > 1000 ? headNum + 1000 : bestNum;
        this.logger.info(`start to import PoW block from height ${headNum + 1} to ${tgtNum}`);

        for (let num = headNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.getBlockFromRPC(num);
          await this.processBlock(blk);
          this.logger.info({ height: blk.height, hash: blk.hash }, 'imported PoW block');

          if (!head) {
            head = await this.headRepo.create(this.name, blk.height, blk.hash);
          } else {
            head = await this.headRepo.update(this.name, blk.height, blk.hash);
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
}
