import { Document } from 'mongoose';

import { RECENT_WINDOW } from '../const';
import { Block } from '../model/block.interface';
import blockModel from '../model/block.model';

export class BlockRepo {
  private model = blockModel;
  public async getBestBlock() {
    return this.model.findOne({}).sort({ number: -1 });
  }

  public async findAll() {
    return this.model.find();
  }

  public async findRecent() {
    return this.model.find().sort({ createdAt: -1 }).limit(RECENT_WINDOW);
  }

  public async findByNumber(num: number) {
    return this.model.findOne({
      number: num,
    });
  }

  public async findFutureBlocks(num: number): Promise<(Block & Document)[]> {
    return this.model.find({ number: { $gt: num } });
  }

  public async findByHash(hash: string) {
    return this.model.findOne({
      hash,
    });
  }

  public async create(block: Block) {
    return this.model.create(block);
  }

  public async bulkInsert(...block: Block[]) {
    return this.model.create(block);
  }

  public async delete(hash: string) {
    return this.model.deleteOne({ hash });
  }
}

export default BlockRepo;
