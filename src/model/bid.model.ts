import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { Bid } from './bid.interface';

const bidSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  address: { type: String, required: true },
  amount: { type: String, required: true },
  type: { type: String, required: true },
  timestamp: { type: Number, required: true },
  nonce: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },

  auctionID: { type: String, required: true, index: true },
  epoch: { type: Number, required: true, index: true },
  blockNum: { type: Number, required: true, index: true },
  txHash: { type: String, required: true },
  clauseIndex: { type: Number, required: true },

  pending: { type: Boolean, required: true, default: true },
  hammerPrice: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: false,
  },
  lotAmount: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: false,
  },
});

const model = mongoose.model<Bid & mongoose.Document>('Bid', bidSchema, 'bids');

export default model;
