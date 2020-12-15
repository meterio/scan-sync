import { Token } from '../const';
import { Transfer } from '../model/transfer.interface';
import transferModel from '../model/transfer.model';
import { RECENT_WINDOW } from './const';

export class TransferRepo {
  private model = transferModel;

  public async findAll() {
    return this.model.find();
  }

  public async findRecent() {
    return this.model.find().sort({ createdAt: -1 }).limit(RECENT_WINDOW);
  }

  public async findByHash(hash: string) {
    return this.model.findOne({ hash });
  }

  public async findByRange(token: Token, startTS: number, endTS: number) {
    return this.model
      .find({
        token,
        blockTimestamp: { $gte: startTS, $lt: endTS },
      })
      .sort({ blockNumber: 1 });
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
      .find({ $or: [{ from: addr }, { to: addr }] })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(limit * page);
  }

  public async exist(txHash: string, clauseIndex: number) {
    return this.model.exists({ txHash, clauseIndex });
  }

  public async create(transfer: Transfer) {
    return this.model.create(transfer);
  }

  public async deleteFutureTransfers(num: number) {
    return this.model.find({ 'block.number': { $gt: num } });
  }

  public async bulkInsert(...transfers: Transfer[]) {
    return this.model.create(transfers);
  }
}

export default TransferRepo;
