import BigNumber from 'bignumber.js';

import { BlockConcise } from '../model/blockConcise.interface';
import { TokenProfile } from '../model/tokenProfile.interface';
import tokenProfileModel from '../model/tokenProfile.model';

export default class TokenProfileRepo {
  private model = tokenProfileModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({ address: address.toLowerCase() });
  }

  public async existsByAddress(address: string) {
    return this.model.exists({ address: address.toLowerCase() });
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
    creationTxHash: string,
    firstSeen: BlockConcise,
    decimals = 18
  ) {
    return this.model.create({
      name,
      symbol,
      address,
      officialSite,
      decimals,
      totalSupply,
      holdersCount: new BigNumber(0),
      transfersCount: new BigNumber(0),
      master,
      creationTxHash,
      firstSeen,
    });
  }

  public async bulkInsert(...tokenProfiles: TokenProfile[]) {
    return this.model.create(tokenProfiles);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'block.number': { $gte: blockNum } });
  }
}
