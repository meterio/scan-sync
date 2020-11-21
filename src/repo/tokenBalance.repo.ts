import BigNumber from 'bignumber.js';

import { Token } from '../const';
import tokenBalanceModel from '../model/tokenBalance.model';

export class TokenBalanceRepo {
  private tokenBalance = tokenBalanceModel;

  public async findAll() {
    return this.tokenBalance.find();
  }

  public async findByAddress(address: string, token: Token) {
    return this.tokenBalance.findOne({ address, token });
  }

  public async exist(address: string, token: Token) {
    return this.tokenBalance.exists({ address, token });
  }

  public async create(address: string, contractAddress: string) {
    return this.tokenBalance.create({ address, balance: new BigNumber(0), contractAddress });
  }
}

export default TokenBalanceRepo;
