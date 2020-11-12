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
    console.log(`bulk insert ${transfer.length} transfers`);
    for (const t of transfer) {
      const exist = await this.transfer.exists({
        txHash: t.txHash,
        clauseIndex: t.clauseIndex,
      });
      if (!exist) {
        console.log('saving transfers: ', t.txHash, t.clauseIndex);
        await this.transfer.create(t);
      }
    }
    return Promise.resolve();
  }
}

export default TransferRepo;
