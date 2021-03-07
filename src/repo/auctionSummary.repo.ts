import BigNumber from 'bignumber.js';

import { AuctionSummary } from '../model/auctionSummary.interface';
import AuctionSummaryModel from '../model/auctionSummary.model';

export class AuctionSummaryRepo {
  private model = AuctionSummaryModel;

  public async findAll() {
    return this.model.find({}).sort({ createTime: -1 });
  }

  public async findByID(id: string) {
    return this.model.findOne({ id });
  }

  public async existID(id: string) {
    return this.model.exists({ id });
  }

  public async create(auctionSummary: AuctionSummary) {
    return this.model.create(auctionSummary);
  }
}

export default AuctionSummaryRepo;
