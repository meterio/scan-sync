import { ValidatorReward } from '../model/ValidatorReward.interface';
import ValidatorRewardModel from '../model/ValidatorReward.model';

export class ValidatorRewardRepo {
  private model = ValidatorRewardModel;

  public async findAll() {
    return this.model.find({}).sort({ createTime: -1 });
  }

  public async findByEpoch(epoch: number) {
    return this.model.findOne({ epoch });
  }

  public async existEpoch(epoch: number) {
    return this.model.exists({ epoch });
  }

  public async create(validatorReward: ValidatorReward) {
    return this.model.create(validatorReward);
  }
}

export default ValidatorRewardRepo;
