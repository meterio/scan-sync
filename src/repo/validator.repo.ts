import BigNumber from 'bignumber.js';

import { BlockConcise } from '../model/blockConcise.interface';
import { Validator } from '../model/validator.interface';
import validatorModel from '../model/validator.model';

export class ValidatorRepo {
  private model = validatorModel;

  public async findByAddress(address: string) {
    return this.model.findOne({ address: { $regex: new RegExp(`^${address}$`, 'i') } });
  }

  public async findByPubKey(pubKey: string) {
    return this.model.findOne({ pubKey });
  }

  public async bulkInsert(...models: Validator[]) {
    return this.model.create(models);
  }

  public async deleteAll() {
    return this.model.deleteMany({});
  }
}

export default ValidatorRepo;
