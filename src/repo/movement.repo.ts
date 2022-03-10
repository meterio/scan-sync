import { Token } from '../const';
import { RECENT_WINDOW } from '../const';
import { Movement } from '../model/movement.interface';
import movementModel from '../model/movement.model';

export default class MovementRepo {
  private model = movementModel;

  public async findAll() {
    return this.model.find();
  }

  public async findRecent() {
    return this.model.find().sort({ createdAt: -1 }).limit(RECENT_WINDOW);
  }

  public async findByHash(hash: string) {
    return this.model.findOne({ hash });
  }

  public async findByBlockNum(blockNum: number) {
    return this.model.find({ 'block.number': blockNum });
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

  public async create(movement: Movement) {
    return this.model.create(movement);
  }

  public async deleteFutureMovements(num: number) {
    return this.model.find({ 'block.number': { $gt: num } });
  }

  public async bulkInsert(...movements: Movement[]) {
    return this.model.create(movements);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'block.number': { $gte: blockNum } });
  }
}
