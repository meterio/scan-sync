import { Bid } from '../model/bid.interface';
import bidModel from '../model/bid.model';

export default class BidRepo {
  private model = bidModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({
      address: address.toLowerCase(),
    });
  }

  public async create(bid: Bid) {
    return this.model.create(bid);
  }

  public async findById(id: string) {
    return this.model.findOne({ id });
  }

  public async findByAuctionID(auctionID: string) {
    return this.model.find({ auctionID });
  }

  public async bulkInsert(...bids: Bid[]) {
    return this.model.create(bids);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ blockNum: { $gte: blockNum } });
  }
}
