import { Bound } from '../model/bound.interface';
import boundModel from '../model/bound.model';

export class BoundRepo {
  private model = boundModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByOwner(owner: string) {
    return this.model.find({ owner: owner.toLowerCase() });
  }

  public async exist(txHash: string, clauseIndex: number) {
    return this.model.exists({ txHash, clauseIndex });
  }

  public async create(bound: Bound) {
    return this.model.create(bound);
  }

  public async bulkInsert(...bounds: Bound[]) {
    return this.model.create(bounds);
  }
}

export default BoundRepo;
