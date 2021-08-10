import { Document } from 'mongoose';

import { RECENT_WINDOW } from '../const';
import { BlockType } from '../const';
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

  public async findBlockWithTxFrom(num: number) {
    // find block with tx in (fromNu, toNum] range
    return this.model
      .findOne({
        number: { $gt: num },
        txCount: { $gt: 0 },
      })
      .sort({ number: 1 });
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

  public async findKBlocksWithoutPowBlocks(pageNum?: number, limitNum?: number) {
    const limit = 20;
    return this.model.find({ blockType: BlockType.KBlock, powBlocks: { $exists: false } }).limit(limit);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ number: { $gte: blockNum } });
  }
}

export default BlockRepo;
