import { RECENT_WINDOW } from '../const';
import { Tx } from '../model/tx.interface';
import txModel from '../model/tx.model';

export default class TxRepo {
  private model = txModel;

  public async findAll() {
    return this.model.find();
  }

  public async findRecent() {
    return this.model.find().sort({ createdAt: -1 }).limit(RECENT_WINDOW);
  }

  public async findByHash(hash: string) {
    return this.model.findOne({ hash });
  }

  public async findByAccount(addr: string, page?: number, limit?: number) {
    if (!!page && page > 0) {
      page = page - 1;
    } else {
      page = 0;
    }
    if (!limit) {
      limit = RECENT_WINDOW;
    }
    return this.model
      .find({ origin: addr })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(limit * page);
  }

  public async findByHashs(hashs: string[]) {
    return this.model.find({ hash: { $in: hashs } });
  }

  public async exist(hash: string) {
    return this.model.exists({ hash });
  }

  public async create(tx: Tx) {
    return this.model.create(tx);
  }

  public async bulkInsert(...txs: Tx[]) {
    await this.model.create(txs);
  }

  public async delete(hash: string) {
    return this.model.deleteOne({ hash });
  }

  public async findTxsAfter(blockNum: number) {
    return this.model.find({ 'block.number': { $gt: blockNum } });
  }

  public async findByOrigin(address: string) {
    return this.model.find({ origin: address });
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'block.number': { $gte: blockNum } });
  }
}
