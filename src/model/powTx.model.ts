import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { PowTx } from './powTx.interface';

const powInSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true },
    index: { type: Number, required: true },
    script: { type: String, required: true },
    sequence: { type: Number, required: true },
    witness: { type: Object, reuquired: false },
  },
  { _id: false }
);
const powOutSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    script: { type: String, required: true },
  },
  { _id: false }
);

const powTxSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true, index: { unique: true } },
    version: { type: Number, required: true },
    locktime: { type: Number, required: true },
    ins: [powInSchema],
    outs: [powOutSchema],

    createdAt: { type: Number, index: true },
  },
  {
    timestamps: {
      currentTime: () => Math.floor(Date.now() / 1000),
      updatedAt: false,
    },
  }
);

powTxSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const powTxModel = mongoose.model<PowTx & mongoose.Document>(
  'powTx',
  powTxSchema,
  'powtxs'
);

export default powTxModel;
