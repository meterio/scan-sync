import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { blockConciseSchema } from './blockConcise.model';
import { TokenBalance } from './tokenBalance.interface';

const tokenBalanceSchema = new mongoose.Schema<TokenBalance>(
  {
    address: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    balance: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    symbol: { type: String, required: false },
    rank: { type: Number, required: true, default: 99999999 },
    lastUpdate: blockConciseSchema,

    createdAt: { type: Number, index: true },
    updatedAt: { type: Number },
  },
  {
    timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
  }
);

tokenBalanceSchema.index({ address: 1, tokenAddress: 1 }, { unique: true });
tokenBalanceSchema.index({ address: 1 });

tokenBalanceSchema.set('toJSON', {
  transform: (obj, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<TokenBalance & mongoose.Document>(
  'TokenBalance',
  tokenBalanceSchema,
  'tokenBalance'
);

export default model;
