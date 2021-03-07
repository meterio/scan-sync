import { EpochRewardSummary } from '../model/epochRewardSummary.interface';
import EpochRewardSummaryModel from '../model/EpochRewardSummary.model';

export class EpochRewardSummaryRepo {
  private model = EpochRewardSummaryModel;

  public async findAll() {
    return this.model.find({}).sort({ createTime: -1 });
  }

  public async findByEpoch(epoch: number) {
    return this.model.findOne({ epoch });
  }

  public async existEpoch(epoch: number) {
    return this.model.exists({ epoch });
  }

  public async create(epochRewardSummary: EpochRewardSummary) {
    return this.model.create(epochRewardSummary);
  }
}

export default EpochRewardSummaryRepo;
