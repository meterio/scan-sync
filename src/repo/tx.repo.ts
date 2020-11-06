import txModel from '../model/tx.model';
import { Tx } from '../model/tx.interface';

export class TxRepo {
  private tx = txModel;

  public async findAll() {
    return this.tx.find();
  }

  public async findByHash(hash: string) {
    return this.tx.findOne({
      hash,
    });
  }

  public async create(tx: Tx) {
    return this.tx.create(tx);
  }

  public async bulkInsert(...tx: Tx[]) {
    return this.tx.collection.insertMany(tx);
  }
}

export default TxRepo;
