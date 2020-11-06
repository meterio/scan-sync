import * as mongoose from 'mongoose';
import BigNumber from 'bignumber.js';
import { PowBlock } from './powBlock.interface';

const powBlockSchema = new mongoose.Schema({
  hash: { type: String, required: true },
  confirmations: { type: Number, required: true },
  strippedSize: { type: Number, required: true },
  size: { type: Number, required: true },
  weight: { type: Number, required: true },
  height: { type: Number, required: true },
  version: { type: Number, required: true },
  versionHex: { type: String, required: true },
  merkleRoot: { type: String, required: true },
  tx: [{ type: String }],
  time: { type: Number, required: true },
  medianTime: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  nonce: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  bits: { type: String, required: true },
  difficulty: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  chainWork: { type: String, required: true },
  nTx: { type: Number, required: true },
  previousBlockHash: { type: String, required: true },
  nextBlockHash: { type: String, required: true },
  beneficiary: { type: String, required: false },
});

const powBlockModel = mongoose.model<PowBlock & mongoose.Document>(
  'powBlock',
  powBlockSchema,
  'powblocks'
);

export default powBlockModel;
