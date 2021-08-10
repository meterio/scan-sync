import { Unbound } from '../model/unbound.interface';
import unboundModel from '../model/unbound.model';

export class UnboundRepo {
  private model = unboundModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByOwner(owner: string) {
    return this.model.find({ owner: owner.toLowerCase() });
  }

  public async exist(txHash: string, clauseIndex: number) {
    return this.model.exists({ txHash, clauseIndex });
  }

  public async create(unbound: Unbound) {
    return this.model.create(unbound);
  }

  public async bulkInsert(...unbounds: Unbound[]) {
    return this.model.create(unbounds);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'block.number': { $gte: blockNum } });
  }
}

export default UnboundRepo;
