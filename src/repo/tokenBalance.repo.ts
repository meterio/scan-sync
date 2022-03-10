import BigNumber from 'bignumber.js';

import { BlockConcise } from '../model/blockConcise.interface';
import tokenBalanceModel from '../model/tokenBalance.model';

export default class TokenBalanceRepo {
  private model = tokenBalanceModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string, tokenAddress: string) {
    return this.model.findOne({
      address: address.toLowerCase(),
      tokenAddress: tokenAddress.toLowerCase(),
    });
  }

  public async findByTokenAddress(tokenAddress: string) {
    return this.model.find({
      tokenAddress: tokenAddress.toLowerCase(),
    });
  }

  public async exist(address: string, tokenAddress: string) {
    return this.model.exists({
      address: address.toLowerCase(),
      tokenAddress: tokenAddress.toLowerCase(),
    });
  }

  public async create(address: string, tokenAddress: string, symbol: string, lastUpdate: BlockConcise) {
    return this.model.create({
      address: address.toLowerCase(),
      balance: new BigNumber(0),
      symbol,
      tokenAddress: tokenAddress.toLowerCase(),
      firstSeen: lastUpdate,
      lastUpdate,
      rank: 99999999,
    });
  }
}
