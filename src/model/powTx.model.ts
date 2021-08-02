import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { PowIn, PowOut, PowTx } from './powTx.interface';

const powInSchema = new mongoose.Schema<PowIn>(
  {
    hash: { type: String, required: true },
    index: { type: Number, required: true },
    script: { type: String, required: true },
    sequence: { type: Number, required: true },
    witness: { type: Object, reuquired: false },
  },
  { _id: false }
);
const powOutSchema = new mongoose.Schema<PowOut>(
  {
    value: { type: Number, required: true },
    script: { type: String, required: true },
  },
  { _id: false }
);

const powTxSchema = new mongoose.Schema<PowTx>(
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

const model = mongoose.model<PowTx & mongoose.Document>(
  'PowTx',
  powTxSchema,
  'powTxs'
);

export default model;
