import { PowBlock } from '../model/powBlock.interface';
import powBlockModel from '../model/powBlock.model';
import { RECENT_WINDOW } from './const';

export class PowBlockRepo {
  private powBlock = powBlockModel;

  public async getBestBlock() {
    return this.powBlock.findOne({}).sort({ height: -1 });
  }

  public async findAll() {
    return this.powBlock.find();
  }

  public async findRecent() {
    return this.powBlock.find().sort({ createdAt: -1 }).limit(RECENT_WINDOW);
  }

  public async findByHeight(num: number) {
    return this.powBlock.findOne({
      height: num,
    });
  }

  public async findByHash(hash: string) {
    return this.powBlock.findOne({
      hash,
    });
  }

  public async findFutureBlocks(num: number) {
    return this.powBlock.find({ height: { $gt: num } });
  }

  public async create(powBlock: PowBlock) {
    return this.powBlock.create(powBlock);
  }

  public async delete(hash: string) {
    return this.powBlock.deleteOne({ hash });
  }
}

export default PowBlockRepo;
