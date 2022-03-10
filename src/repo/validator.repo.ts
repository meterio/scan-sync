import { ValidatorStatus } from '../const';
import { Validator } from '../model/validator.interface';
import validatorModel from '../model/validator.model';

export default class ValidatorRepo {
  private model = validatorModel;

  public async findAll() {
    return this.model.find({});
  }

  public async findByAddress(address: string) {
    return this.model.findOne({ address: address.toLowerCase() });
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

  public async emptyPenaltyPoints() {
    return this.model.updateMany(
      {
        status: { $in: [ValidatorStatus.CANDIDATE, ValidatorStatus.DELEGATE] },
      },
      { $set: { totalPoints: 0 } }
    );
  }
}
