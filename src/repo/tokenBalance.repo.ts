import BigNumber from 'bignumber.js';

import { BlockConcise } from '../model/blockConcise.interface';
import tokenBalanceModel from '../model/tokenBalance.model';

export class TokenBalanceRepo {
  private model = tokenBalanceModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string, tokenAddress: string) {
    return this.model.findOne({
      address: { $regex: new RegExp(`^${address}$`, 'i') },
      tokenAddress: { $regex: new RegExp(`^${tokenAddress}$`, 'i') },
    });
  }

  public async exist(address: string, tokenAddress: string) {
    return this.model.exists({
      address: { $regex: new RegExp(`^${address}$`, 'i') },
      tokenAddress: { $regex: new RegExp(`^${tokenAddress}$`, 'i') },
    });
  }

  public async create(address: string, tokenAddress: string, symbol: string, lastUpdate: BlockConcise) {
    return this.model.create({
      address: address.toLowerCase(),
      balance: new BigNumber(0),
      symbol,
      tokenAddress: tokenAddress.toLowerCase(),
      lastUpdate,
    });
  }
}

export default TokenBalanceRepo;
