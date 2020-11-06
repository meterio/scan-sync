import accountModel from '../model/account.model';
import { BlockConcise } from '../model/blockConcise.interface';
import { Token } from '../const/model';
import BigNumber from 'bignumber.js';
export class AccountRepo {
  private account = accountModel;

  public async findAll() {
    return this.account.find();
  }

  public async findByAddress(address: string) {
    return this.account.findOne({
      address,
    });
  }

  public async findByAddressList(addressList: string[]) {
    return this.account.find({
      address: { $in: addressList },
    });
  }

  public async create(
    address: string,
    firstSeen: BlockConcise,
    token: Token,
    lastUpdate: BlockConcise
  ) {
    return this.account.create({
      address,
      balance: new BigNumber('0'),
      token,
      firstSeen,
      lastUpdate,
    });
  }
}

export default AccountRepo;
