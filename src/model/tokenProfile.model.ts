import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { blockConciseSchema } from './blockConcise.model';
import { TokenProfile } from './tokenProfile.interface';

const tokenProfileSchema = new mongoose.Schema<TokenProfile>(
  {
    name: { type: String, required: true, index: true },
    symbol: { type: String, required: true, index: true },
    address: { type: String, required: true, unique: true, index: true },
    decimals: { type: Number, required: true, default: 18 },
    officialSite: { type: String, required: false },
    totalSupply: {
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

    master: { type: String, required: false },
    creationTxHash: { type: String, required: false },
    firstSeen: blockConciseSchema,

    createdAt: { type: Number, required: true, index: true },
    updatedAt: { type: Number },
  },
  {
    timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
  }
);

tokenProfileSchema.index({ 'block.number': 1 });

tokenProfileSchema.set('toJSON', {
  transform: (obj, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<TokenProfile & mongoose.Document>('TokenProfile', tokenProfileSchema, 'token_profile');

export default model;
