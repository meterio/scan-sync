import powTxModel from '../model/powTx.model';
import { PowTx } from '../model/powTx.interface';

export class PowTxRepo {
  private powTx = powTxModel;

  public async findAll() {
    return this.powTx.find();
  }

  public async findByHash(hash: string) {
    return this.powTx.findOne({
      hash,
    });
  }

  public async create(powPowTx: PowTx) {
    return this.powTx.create(powPowTx);
  }

  public async delete(hash: string) {
    return this.powTx.deleteOne({ hash });
  }
}

export default PowTxRepo;
