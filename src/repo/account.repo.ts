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
      address: { $regex: new RegExp(`^${address}$`, 'i') },
    });
  }

  public async findByAddressList(addressList: string[]) {
    return this.model.find({
      address: { $in: addressList },
    });
  }

  public async create(address: string, firstSeen: BlockConcise, lastUpdate: BlockConcise) {
    return this.model.create({
      address: address.toLowerCase(),
      mtrBalance: new BigNumber('0'),
      mtrgBalance: new BigNumber('0'),
      mtrRank: 99999999,
      mtrgRank: 99999999,

      firstSeen,
      lastUpdate,
    });
  }

  public async updateMTRRank(address: string, mtrRank: number) {
    return this.model.updateOne(
      { address: address.toLowerCase() },
      {
        $set: {
          mtrRank,
        },
      }
    );
  }

  public async updateMTRGRank(address: string, mtrgRank: number) {
    return this.model.updateOne(
      { address: address.toLowerCase() },
      {
        $set: {
          mtrgRank,
        },
      }
    );
  }
}

export default AccountRepo;
