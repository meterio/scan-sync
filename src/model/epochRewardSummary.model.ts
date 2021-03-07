import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { EpochRewardSummary } from './epochRewardSummary.interface';

const epochRewardSummarySchema = new mongoose.Schema({
  epoch: { type: Number, required: true, unique: true },
  blockNum: { type: Number, required: true },
  timestamp: { type: Number, required: true },

  autobidTotal: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  autobidCount: { type: Number, required: true },
  transferTotal: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  transferCount: { type: Number, required: true },
  totalReward: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
});

const model = mongoose.model<EpochRewardSummary & mongoose.Document>(
  'epochRewardSummary',
  epochRewardSummarySchema,
  'epochRewardSummaries'
);

export default model;
