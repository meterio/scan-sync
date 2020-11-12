import * as mongoose from 'mongoose';

import { Token, enumKeys } from '../const/model';
import { Account } from './account.interface';
import { blockConciseSchema } from './blockConcise.model';

const accountSchema = new mongoose.Schema({
  address: { type: String, required: true },
  balance: { type: String, required: true },
  token: {
    type: String,
    enum: enumKeys(Token),
    get: (enumValue: string) => Token[enumValue as keyof typeof Token],
    set: (enumValue: Token) => Token[enumValue],
    required: true,
  },

  firstSeen: blockConciseSchema,
  lastUpdate: blockConciseSchema,
});

accountSchema.index({ token: 1, address: 1 }, { unique: true });

const accountModel = mongoose.model<Account & mongoose.Document>(
  'Account',
  accountSchema
);

export default accountModel;
