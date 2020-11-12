import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const/model';
import { Transfer } from './transfer.interface';
import { blockConciseSchema } from './blockConcise.model';

const transferSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  amount: { type: String, required: true },
  token: {
    type: String,
    enum: enumKeys(Token),
    get: (enumValue: string) => Token[enumValue as keyof typeof Token],
    set: (enumValue: Token) => Token[enumValue],
    required: true,
  },

  block: blockConciseSchema,
  txHash: { type: String, required: true },
  clauseIndex: { type: Number, required: true },

  createdAt: Number,
});

transferSchema.index({ txHash: 1, clauseIndex: 1 }, { unique: true });

transferSchema.set('toJSON', {
  virtuals: false,
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
  },
});

const transferModel = mongoose.model<Transfer & mongoose.Document>(
  'Transfer',
  transferSchema
);

export default transferModel;
