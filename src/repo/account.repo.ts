import BigNumber from 'bignumber.js';

import accountModel from '../model/account.model';
import { BlockConcise } from '../model/blockConcise.interface';
export class AccountRepo {
  private model = accountModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({
      address,
    });
  }

  public async findByAddressList(addressList: string[]) {
    return this.model.find({
      address: { $in: addressList },
    });
  }

  public async create(address: string, firstSeen: BlockConcise, lastUpdate: BlockConcise) {
    return this.model.create({
      address,
      mtrBalance: new BigNumber('0'),
      mtrgBalance: new BigNumber('0'),

      firstSeen,
      lastUpdate,
    });
  }
}

export default AccountRepo;
