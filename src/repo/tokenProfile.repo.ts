import BigNumber from 'bignumber.js';

import tokenProfileModel from '../model/tokenProfile.model';

export class TokenProfileRepo {
  private model = tokenProfileModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({ address: address.toLowerCase() });
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
    master: string,
    decimals: 18
  ) {
    return this.model.create({
      name,
      symbol: symbol.toUpperCase(),
      address,
      officialSite,
      decimals,
      totalSupply,
      circulation: new BigNumber(0),
      holdersCount: new BigNumber(0),
      transfersCount: new BigNumber(0),
      master,
    });
  }
}

export default TokenProfileRepo;
