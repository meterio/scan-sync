import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const/model';
import { Transfer } from './transfer.interface';
import { blockConciseSchema } from './blockConcise.model';

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

    txHash: { type: String, required: true },
    block: blockConciseSchema,

    createdAt: Number,
    updatedAt: Number,
  },
  {
    timestamps: {
      currentTime: () => Math.floor(Date.now() / 1000),
    },
  }
);

transferSchema.index({ network: 1, hash: 1, logId: 1 }, { unique: true });

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
