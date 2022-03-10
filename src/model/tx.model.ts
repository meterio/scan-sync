import * as devkit from '@meterio/devkit';
import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { Token, ZeroAddress, enumKeys } from '../const';
import { AccountLockModuleAddress, AuctionModuleAddress, StakingModuleAddress } from '../const/address';
import { blockConciseSchema } from './blockConcise.model';
import { Clause, PosEvent, PosTransfer, Transfer, Tx, TxOutput } from './tx.interface';

const clauseSchema = new mongoose.Schema<Clause>(
  {
    to: { type: String, required: false },
    value: {
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
    data: { type: String, required: true },
  },
  { _id: false }
);

const posEventSchema = new mongoose.Schema<PosEvent>(
  {
    address: { type: String, required: true },
    topics: [{ type: String, required: true }],
    data: { type: String, required: true },
  },
  { _id: false }
);

posEventSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const posTransferSchema = new mongoose.Schema<PosTransfer>(
  {
    sender: { type: String, required: true },
    recipient: { type: String, required: true },
    amount: { type: String, required: true },
    token: { type: Number, required: false },
  },
  { _id: false }
);

posTransferSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const txOutputSchema = new mongoose.Schema<TxOutput>(
  {
    contractAddress: { type: String, required: false },
    events: [posEventSchema],
    transfers: [posTransferSchema],
  },
  { _id: false }
);

const txSchema = new mongoose.Schema<Tx>(
  {
    hash: { type: String, required: true, index: { unique: true } },

    block: blockConciseSchema,
    txIndex: { type: Number, required: true },

    chainTag: { type: Number, required: true },
    blockRef: { type: String, required: true },
    expiration: { type: Number, required: true },
    gasPriceCoef: { type: Number, required: true },
    gas: { type: Number, required: true },
    nonce: { type: String, required: true },
    dependsOn: { type: String, required: false },
    origin: { type: String, required: true },

    clauses: [clauseSchema],
    clauseCount: { type: Number, required: true },
    size: { type: Number, required: true },

    // receipt
    gasUsed: { type: Number, required: true },
    gasPayer: { type: String, required: true },
    paid: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    reward: {
      type: String,
      get: (num: string) => new BigNumber(num),
      set: (bnum: BigNumber) => bnum.toFixed(0),
      required: true,
    },
    reverted: {
      type: Boolean,
      required: true,
    },
    outputs: [txOutputSchema],

    createdAt: { type: Number, index: true },
  },
  {
    timestamps: {
      currentTime: () => Math.floor(Date.now() / 1000),
      updatedAt: false,
    },
  }
);

txSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

txSchema.index({ 'block.hash': 1 });
txSchema.index({ 'block.number': -1 });

txSchema.methods.getType = function () {
  for (const c of this.clauses) {
    if (c.data !== '0x') {
      return 'call';
    }
  }
  if (this.origin === ZeroAddress) {
    return 'reward';
  }
  return 'transfer';
};

txSchema.methods.getType = function () {
  for (const c of this.clauses) {
    if (c.data !== '0x') {
      if (c.to) {
        if (c.to.toLowerCase() === AccountLockModuleAddress) {
          return 'account lock';
        }
        if (c.to.toLowerCase() === StakingModuleAddress) {
          return 'staking';
        }
        if (c.to.toLowerCase() === AuctionModuleAddress) {
          return 'auction';
        }
      }
      const se = devkit.ScriptEngine;
      if (se.IsScriptEngineData(c.data)) {
        const scriptData = se.decodeScriptData(c.data);
        if (scriptData.header.modId === se.ModuleID.Staking) {
          return 'staking';
        }
        if (scriptData.header.modId === se.ModuleID.Auction) {
          return 'auction';
        }
        if (scriptData.header.modId === se.ModuleID.AccountLock) {
          return 'account lock';
        }
      }
      return 'call';
    }
  }
  if (this.origin === ZeroAddress) {
    return 'reward';
  }
  return 'transfer';
};

txSchema.methods.toSummary = function (addr) {
  const token = this.clauseCount > 0 ? this.clauses[0].token : 0;

  return {
    hash: this.hash,
    block: this.block,
    origin: this.origin,
    clauseCount: this.clauses ? this.clauses.length : 0,
    type: this.getType(),
    paid: this.paid.toFixed(),
    gasUsed: this.gasUsed,
    gasPriceCoef: this.gasPriceCoef,
    gasPrice: 5e11 + 5e11 * (this.gasPriceCoef / 255),
    token: token == 0 ? 'MTR' : 'MTRG',
    reverted: this.reverted,
    toCount: this.toCount,
  };
};
const model = mongoose.model<Tx & mongoose.Document>('Tx', txSchema, 'tx');

export default model;
