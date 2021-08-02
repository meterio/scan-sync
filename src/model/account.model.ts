import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { Account } from './account.interface';
import { blockConciseSchema } from './blockConcise.model';

const accountSchema = new mongoose.Schema<Account>(
  {
    address: { type: String, required: true },
    name: { type: String, required: false },
    mtrBalance: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    mtrgBalance: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    mtrBounded: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: false,
    },
    mtrgBounded: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: false,
    },
    mtrRank: { type: Number, required: false },
    mtrgRank: { type: Number, required: false },
    code: { type: String, required: false },
    master: { type: String, required: false },

    firstSeen: blockConciseSchema,
    lastUpdate: blockConciseSchema,

    createdAt: { type: Number, index: true },
    updatedAt: { type: Number },
  },
  {
    timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
  }
);

accountSchema.index({ token: 1, address: 1 }, { unique: true });
accountSchema.index({ address: 1 });

accountSchema.set('toJSON', {
  transform: (obj, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<Account & mongoose.Document>(
  'Account',
  accountSchema
);

export default model;
