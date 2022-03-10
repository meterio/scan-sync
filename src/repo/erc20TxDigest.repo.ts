import { Erc20TxDigest } from '../model/erc20TxDigest.interface';
import erc20TxDigestModel from '../model/erc20TxDigest.model';

export default class Erc20TxDigestRepo {
  private model = erc20TxDigestModel;

  public async findAll() {
    return this.model.find();
  }

  public async exist(txHash: string, clauseIndex: number) {
    return this.model.exists({ txHash, clauseIndex });
  }

  public async create(erc20TxDigest: Erc20TxDigest) {
    return this.model.create(erc20TxDigest);
  }

  public async bulkInsert(...erc20TxDigests: Erc20TxDigest[]) {
    return this.model.create(erc20TxDigests);
  }

  public async deleteAfter(blockNum: number) {
    return this.model.deleteMany({ 'block.number': { $gte: blockNum } });
  }
}
