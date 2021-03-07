import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { EpochReward } from './epochReward.interface';

const epochRewardSchema = new mongoose.Schema({
  epoch: { type: Number, required: true, unique: true },
  blockNum: { type: Number, required: true },
  txHash: { type: String, required: true },
  clauseIndex: { type: Number, required: true },

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

const model = mongoose.model<EpochReward & mongoose.Document>('epochReward', epochRewardSchema, 'epochRewards');

export default model;
