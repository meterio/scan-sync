import { TxDigest } from '../model/txDigest.interface';
import txDigestModel from '../model/txDigest.model';

export default class TxDigestRepo {
  private model = txDigestModel;

  public async findAll() {
    return this.model.find();
  }

  public async exist(txHash: string, clauseIndex: number) {
    return this.model.exists({ txHash, clauseIndex });
  }

  public async create(txDigest: TxDigest) {
    return this.model.create(txDigest);
  }

  public async bulkInsert(...txDigests: TxDigest[]) {
    return this.model.create(txDigests);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'block.number': { $gte: blockNum } });
  }
}
