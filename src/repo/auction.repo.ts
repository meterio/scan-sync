import { Auction } from '../model/auction.interface';
import AuctionModel from '../model/auction.model';

export class AuctionRepo {
  private model = AuctionModel;

  public async findAll() {
    return this.model.find({}).sort({ createTime: -1 });
  }

  public async findByID(id: string) {
    return this.model.findOne({ id });
  }

  public async existID(id: string) {
    return this.model.exists({ id });
  }

  public async create(auction: Auction) {
    return this.model.create(auction);
  }

  public async findPresent() {
    return this.model.findOne({ pending: true });
  }
}

export default AuctionRepo;
