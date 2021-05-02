import { Known } from '../model/known.interface';
import knownModel from '../model/known.model';

export class KnownRepo {
  private model = knownModel;
  public async findAll() {
    return this.model.find();
  }

  public async exist(address: string) {
    return this.model.exists({ address });
  }

  public async findByAddress(address: string) {
    return this.model.findOne({ address: address.toLowerCase() });
  }

  public async create(known: Known) {
    return this.model.create(known);
  }

  public async delete(hash: string) {
    return this.model.deleteOne({ hash });
  }
}

export default KnownRepo;
