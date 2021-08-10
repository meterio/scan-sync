import BigNumber from 'bignumber.js';

import { EpochReward } from '../model/epochReward.interface';
import EpochRewardModel from '../model/epochReward.model';

export class EpochRewardRepo {
  private model = EpochRewardModel;

  public async findAll() {
    return this.model.find({}).sort({ createTime: -1 });
  }

  public async findByEpoch(epoch: number) {
    return this.model.find({ epoch });
  }

  public async create(epochReward: EpochReward) {
    return this.model.create(epochReward);
  }

  public async findByBid(epoch: number, blockNum: number, address: string, amount: BigNumber) {
    return this.model.findOne({ epoch, blockNum, address, amount });
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ blockNum: { $gte: blockNum } });
  }
}

export default EpochRewardRepo;
