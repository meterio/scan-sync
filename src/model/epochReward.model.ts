import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { EpochReward } from './epochReward.interface';

const epochRewardSchema = new mongoose.Schema<EpochReward>({
  epoch: { type: Number, required: true, index: true },
  blockNum: { type: Number, required: true },
  txHash: { type: String, required: true },
  clauseIndex: { type: Number, required: true },
  bidID: { type: String, required: false },

  address: { type: String, required: true },
  amount: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  type: {
    type: String,
    enum: ['autobid', 'transfer'],
    required: true,
  },
});

const model = mongoose.model<EpochReward & mongoose.Document>('EpochReward', epochRewardSchema, 'epochRewards');

export default model;
