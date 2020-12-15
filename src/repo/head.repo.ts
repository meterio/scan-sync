import headModel from '../model/head.model';

export class HeadRepo {
  private model = headModel;

  public async findByKey(key: string) {
    return this.model.findOne({ key });
  }

  public async create(key: string, num: number, hash: string) {
    return this.model.create({ key, num, hash });
  }

  public async update(key: string, num: number, hash: string) {
    return this.model.updateOne({ key }, { $set: { num, hash } });
  }
}

export default HeadRepo;
