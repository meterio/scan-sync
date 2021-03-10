import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const';
import { blockConciseSchema } from './blockConcise.model';
import { Bound } from './bound.interface';

const boundSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true },
    amount: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    token: {
      type: String,
      enum: enumKeys(Token),
      get: (enumValue: string) => Token[enumValue as keyof typeof Token],
      set: (enumValue: Token) => Token[enumValue],
      required: true,
    },

    block: blockConciseSchema,
    txHash: { type: String, required: true },
    clauseIndex: { type: Number, required: false },
    logIndex: { type: Number, required: false },

    createdAt: { type: Number, index: true },
  },
  {
    timestamps: {
      currentTime: () => Math.floor(Date.now() / 1000),
      updatedAt: false,
    },
  }
);

boundSchema.index({ txHash: 1, clauseIndex: 1, logIndex: 1 }, { unique: true });
boundSchema.index({ owner: 1 });

boundSchema.set('toJSON', {
  virtuals: false,
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<Bound & mongoose.Document>('Bound', boundSchema);

export default model;