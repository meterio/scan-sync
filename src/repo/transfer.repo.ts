import { Transfer } from '../model/transfer.interface';

import { Token } from '../const/model';
import transferModel from '../model/transfer.model';

export class TransferRepo {
  private transfer = transferModel;

  public async findAll() {
    return this.transfer.find();
  }

  public async findByHash(hash: string) {
    return this.transfer.findOne({ hash });
  }

  public async findByRange(token: Token, startTS: number, endTS: number) {
    return this.transfer
      .find({
        token,
        blockTimestamp: { $gte: startTS, $lt: endTS },
      })
      .sort({ blockNumber: 1 });
  }

  public async create(transfer: Transfer) {
    return this.transfer.create(transfer);
  }

  public async bulkInsert(...transfer: Transfer[]) {
    return this.transfer.collection.insertMany(transfer);
  }
}

export default TransferRepo;
