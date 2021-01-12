import * as mongoose from 'mongoose';

import { Bid } from './bid.interface';

const bidSchema = new mongoose.Schema({
  txid: { type: String, required: true, unique: true },
  address: { type: String, required: true },
  amount: { type: String, required: true },
  type: { type: String, required: true },
  timestamp: { type: Number, required: true },
  nonce: { type: Number, required: true },
  auctionID: { type: String, required: true },
});

const model = mongoose.model<Bid & mongoose.Document>('bid', bidSchema, 'bids');

export default model;
