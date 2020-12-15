import BigNumber from 'bignumber.js';

import { BlockConcise } from '../model/blockConcise.interface';
import tokenBalanceModel from '../model/tokenBalance.model';

export class TokenBalanceRepo {
  private model = tokenBalanceModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string, tokenAddress: string) {
    return this.model.findOne({ address, tokenAddress });
  }

  public async exist(address: string, tokenAddress: string) {
    return this.model.exists({ address, tokenAddress });
  }

  public async create(address: string, tokenAddress: string, lastUpdate: BlockConcise) {
    return this.model.create({ address, balance: new BigNumber(0), tokenAddress, lastUpdate });
  }
}

export default TokenBalanceRepo;
