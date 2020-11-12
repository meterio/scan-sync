import txModel from '../model/tx.model';
import { Tx } from '../model/tx.interface';

export class TxRepo {
  private tx = txModel;

  public async findAll() {
    return this.tx.find();
  }

  public async findByHash(hash: string) {
    return this.tx.findOne({ hash });
  }

  public async exist(hash: string) {
    return this.tx.exists({ hash });
  }

  public async create(tx: Tx) {
    console.log('insert: ', tx.hash);
    return this.tx.create(tx);
  }

  public async bulkInsert(...tx: Tx[]) {
    for (const t of tx) {
      const exist = await this.tx.exists({ hash: t.hash });
      if (!exist) {
        console.log('bulk insert: ', t.hash);
        await this.tx.create(t);
      }
    }
    return Promise.resolve();
    // return this.tx.create(tx);
  }
}

export default TxRepo;
