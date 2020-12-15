import { BlockConcise } from '../model/blockConcise.interface';
import { Committee } from '../model/committee.interface';
import committeeModel from '../model/committee.model';

export class CommitteeRepo {
  private committee = committeeModel;

  public async findCurrent() {
    return this.committee.findOne({ epoch: -1 });
  }
  public async findByEpoch(epoch: number) {
    return this.committee.findOne({ epoch });
  }

  public async create(committee: Committee) {
    return this.committee.create(committee);
  }

  public async delete(hash: string) {
    return this.committee.deleteOne({ hash });
  }

  public async updateEndBlock(epoch: number, endBlock: BlockConcise) {
    return this.committee.updateOne({ epoch }, { $set: { endBlock } });
  }
}

export default CommitteeRepo;
