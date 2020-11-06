import blockModel from '../model/block.model';
import { Block } from '../model/block.interface';

export class BlockRepo {
  private block = blockModel;
  public async getBestBlock() {
    return this.block.findOne({}).sort({ number: -1 });
  }

  public async findAll() {
    return this.block.find();
  }

  public async findByNumber(num: number) {
    return this.block.findOne({
      number: num,
    });
  }

  public async findByHash(hash: string) {
    return this.block.findOne({
      hash,
    });
  }

  public async create(block: Block) {
    return this.block.create(block);
  }

  public async bulkInsert(...block: Block[]) {
    return this.block.create(block);
  }
}

export default BlockRepo;
