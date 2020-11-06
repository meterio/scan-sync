import * as Logger from 'bunyan';
import { EventEmitter } from 'events';
import PowBlockRepo from '../repo/powBlock.repo';
import { Pow } from '../utils/pow-rpc';
import { sleep, InterruptedError } from '../utils/utils';
import { PowBlock } from '../model/powBlock.interface';
import PowTxRepo from '../repo/powTx.repo';

const SAMPLING_INTERVAL = 500;
const PRELOAD_WINDOW = 5;

export class PowCMD {
  private shutdown = false;
  private ev = new EventEmitter();
  private name = 'pos';
  private logger = Logger.createLogger({ name: this.name });
  private powBlockRepo = new PowBlockRepo();
  private powTxRepo = new PowTxRepo();
  private pow = new Pow();

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
    if (blk.tx && blk.tx.length > 0) {
      for (const txhash of blk.tx) {
        const powTx = await this.pow.getTx(txhash);
        await this.powTxRepo.create(powTx);
      }
    }
    await this.powBlockRepo.create(blk);
    this.logger.info(
      { height: blk.height, hash: blk.hash },
      `processed block: ${blk.height}`
    );
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
    const localBestBlock = await this.powBlockRepo.getBestBlock();
    const localBestNum = localBestBlock ? localBestBlock.height : 0;
    this.logger.info(`start import block from height ${localBestNum}`);

    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }
        await sleep(SAMPLING_INTERVAL);

        const localBestBlock = await this.powBlockRepo.getBestBlock();
        const localBestNum = localBestBlock ? localBestBlock.height : 0;
        const info = await this.pow.getBlockchainInfo();
        const bestNum = info.blocks;

        const tgtNum =
          bestNum - localBestNum > 1000 ? localBestNum + 1000 : bestNum;

        for (let num = localBestNum + 1; num <= tgtNum; num++) {
          if (this.shutdown) {
            throw new InterruptedError();
          }
          const blk = await this.getBlockFromRPC(num);
          await this.processBlock(blk);
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
