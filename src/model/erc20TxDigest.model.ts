import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { blockConciseSchema } from './blockConcise.model';
import { Erc20TxDigest } from './erc20TxDigest.interface';

const erc20TxDigestSchema = new mongoose.Schema<Erc20TxDigest>({
  block: blockConciseSchema,
  txHash: { type: String, required: true },

  from: { type: String, required: true, index: true },
  to: { type: String, required: true, index: true },
  value: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  tokenAddress: { type: String, required: true, index: true },

  name: { type: String, required: false },
  symbol: { type: String, required: true, index: true },
  decimals: { type: Number, required: true, index: true },
});

erc20TxDigestSchema.index({ 'block.number': 1, txHash: 1, from: 1, to: 1 }, { unique: true });
erc20TxDigestSchema.index({ 'block.number': 1 });

erc20TxDigestSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const model = mongoose.model<Erc20TxDigest & mongoose.Document>(
  'Erc20TxDigest',
  erc20TxDigestSchema,
  'erc20_tx_digest'
);

export default model;
