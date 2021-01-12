import { Bid } from '../model/bid.interface';
import bidModel from '../model/bid.model';

export class BidRepo {
  private model = bidModel;

  public async findAll() {
    return this.model.find();
  }

  public async findByAddress(address: string) {
    return this.model.findOne({
      address: { $regex: new RegExp(`^${address}$`, 'i') },
    });
  }

  public async bulkInsert(...bids: Bid[]) {
    return this.model.create(bids);
  }
}

export default BidRepo;
