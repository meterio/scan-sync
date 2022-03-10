import BigNumber from 'bignumber.js';

import { Network, getAccountName } from '../const';
import accountModel from '../model/account.model';
import { BlockConcise } from '../model/blockConcise.interface';

export default class AccountRepo {
  private model = accountModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({
      address: address.toLowerCase(),
    });
  }

  public async findByAddressList(addressList: string[]) {
    return this.model.find({
      address: { $in: addressList },
    });
  }

  public async create(
    network: Network,
    address: string,
    firstSeen: BlockConcise,
    lastUpdate: BlockConcise,
    creationTxHash: string,
    type: string,
    master: string | undefined = undefined
  ) {
    const name = getAccountName(network, address);
    return this.model.create({
      name: name,
      address: address.toLowerCase(),
      mtrBalance: new BigNumber('0'),
      mtrgBalance: new BigNumber('0'),
      mtrBounded: new BigNumber('0'),
      mtrgBounded: new BigNumber('0'),
      mtrRank: 99999999,
      mtrgRank: 99999999,

      firstSeen,
      lastUpdate,
      creationTxHash,
      type,
      master,
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

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'firstSeen.number': { $gte: blockNum } });
  }
}
