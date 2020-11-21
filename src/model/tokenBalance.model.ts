import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const';
import BigNumber from 'bignumber.js';
import { TokenBalance } from './tokenBalance.interface';

const tokenBalanceSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    balance: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    contractAddress: { type: String, required: true },

    createdAt: { type: Number, index: true },
    updatedAt: { type: Number },
  },
  {
    timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
  }
);

tokenBalanceSchema.index({ address: 1, token: 1 }, { unique: true });
tokenBalanceSchema.index({ address: 1 });

tokenBalanceSchema.set('toJSON', {
  transform: (obj, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const tokenBalanceModel = mongoose.model<TokenBalance & mongoose.Document>('TokenBalance', tokenBalanceSchema);

export default tokenBalanceModel;
