import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const';
import { blockConciseSchema } from './blockConcise.model';
import { Transfer } from './transfer.interface';

const transferSchema = new mongoose.Schema<Transfer>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
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
    tokenAddress: { type: String, required: false },

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

transferSchema.index(
  { txHash: 1, clauseIndex: 1, logIndex: 1 },
  { unique: true }
);
transferSchema.index({ from: 1 });
transferSchema.index({ to: 1 });
transferSchema.index({ token: 1, tokenAddress: 1 });

transferSchema.set('toJSON', {
  virtuals: false,
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<Transfer & mongoose.Document>(
  'Transfer',
  transferSchema
);

export default model;
