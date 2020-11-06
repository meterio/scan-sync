import powPowTxModel from '../model/powTx.model';
import { PowTx } from '../model/powTx.interface';

export class PowTxRepo {
  private powPowTx = powPowTxModel;

  public async findAll() {
    return this.powPowTx.find();
  }

  public async findByHash(hash: string) {
    return this.powPowTx.findOne({
      hash,
    });
  }

  public async create(powPowTx: PowTx) {
    return this.powPowTx.create(powPowTx);
  }
}

export default PowTxRepo;
