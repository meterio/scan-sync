import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { TokenProfile } from './tokenProfile.interface';

const tokenProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: false, default: 'Unnamed Token' },
    symbol: { type: String, required: false, default: 'ERC20' },
    address: { type: String, required: true, unique: true },
    decimals: { type: Number, required: true, default: 18 },
    officialSite: { type: String, required: false, default: '' },
    totalSupply: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: false,
    },
    circulation: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    holdersCount: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    transfersCount: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    master: { type: String, required: true },

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

const model = mongoose.model<TokenProfile & mongoose.Document>('TokenProfile', tokenProfileSchema, 'tokenProfile');

export default model;
