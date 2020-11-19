import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const';
import { blockConciseSchema } from './blockConcise.model';
import { Transfer } from './transfer.interface';

const transferSchema = new mongoose.Schema(
  {
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
    address: { type: String, required: false },

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

transferSchema.index({ txHash: 1, clauseIndex: 1 }, { unique: true });

transferSchema.set('toJSON', {
  virtuals: false,
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const transferModel = mongoose.model<Transfer & mongoose.Document>('Transfer', transferSchema);

export default transferModel;
