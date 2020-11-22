import BigNumber from 'bignumber.js';

import tokenBalanceModel from '../model/tokenBalance.model';

export class TokenBalanceRepo {
  private tokenBalance = tokenBalanceModel;

  public async findAll() {
    return this.tokenBalance.find();
  }

  public async findByAddress(address: string, tokenAddress: string) {
    return this.tokenBalance.findOne({ address, tokenAddress });
  }

  public async exist(address: string, tokenAddress: string) {
    return this.tokenBalance.exists({ address, tokenAddress });
  }

  public async create(address: string, tokenAddress: string) {
    return this.tokenBalance.create({ address, balance: new BigNumber(0), tokenAddress });
  }
}

export default TokenBalanceRepo;
