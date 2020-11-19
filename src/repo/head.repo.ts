import headModel from '../model/head.model';

export class HeadRepo {
  private head = headModel;

  public async findByKey(key: string) {
    return this.head.findOne({ key });
  }

  public async create(key: string, num: number, hash: string) {
    return this.head.create({ key, num, hash });
  }

  public async update(key: string, num: number, hash: string) {
    return this.head.updateOne({ key }, { $set: { num, hash } });
  }
}

export default HeadRepo;
