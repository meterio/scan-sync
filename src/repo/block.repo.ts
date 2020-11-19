import { Document } from 'mongoose';
import { Block } from '../model/block.interface';
import blockModel from '../model/block.model';
import { RECENT_WINDOW } from './const';

export class BlockRepo {
  private block = blockModel;
  public async getBestBlock() {
    return this.block.findOne({}).sort({ number: -1 });
  }

  public async findAll() {
    return this.block.find();
  }

  public async findRecent() {
    return this.block.find().sort({ createdAt: -1 }).limit(RECENT_WINDOW);
  }

  public async findByNumber(num: number) {
    return this.block.findOne({
      number: num,
    });
  }

  public async findFutureBlocks(num: number): Promise<(Block & Document)[]> {
    return this.block.find({ number: { $gt: num } });
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

  public async delete(hash: string) {
    return this.block.deleteOne({ hash });
  }
}

export default BlockRepo;
