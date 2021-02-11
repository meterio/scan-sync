import BigNumber from 'bignumber.js';

import tokenProfileModel from '../model/tokenProfile.model';

export class TokenProfileRepo {
  private model = tokenProfileModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({ address });
  }

  public async findBySymbol(symbol: string) {
    return this.model.findOne({ symbol });
  }

  public async create(
    name: string,
    symbol: string,
    address: string,
    officialSite: string,
    totalSupply: BigNumber,
    decimals: 18
  ) {
    return this.model.create({
      name,
      symbol: symbol.toUpperCase(),
      address,
      officialSite,
      decimals,
      totalSupply,
    });
  }
}

export default TokenProfileRepo;
