import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { TokenBalance } from './tokenBalance.interface';

const tokenProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    symbol: { type: String, required: true, unique: true },
    address: { type: String, required: true, unique: true },
    officialSite: { type: String, required: true },
    totalSupply: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },

    createdAt: { type: Number, index: true },
    updatedAt: { type: Number },
  },
  {
    timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
  }
);

tokenProfileSchema.index({ address: 1 });

tokenProfileSchema.set('toJSON', {
  transform: (obj, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<TokenBalance & mongoose.Document>('TokenProfile', tokenProfileSchema);

export default model;
