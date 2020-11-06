import powBlockModel from '../model/powBlock.model';
import { PowBlock } from '../model/powBlock.interface';

export class PowBlockRepo {
  private powBlock = powBlockModel;

  public async getBestBlock() {
    return this.powBlock.findOne({}).sort({ height: -1 });
  }

  public async findAll() {
    return this.powBlock.find();
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

  public async create(powBlock: PowBlock) {
    return this.powBlock.create(powBlock);
  }
}

export default PowBlockRepo;
