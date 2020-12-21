import { Bucket } from '../model/bucket.interface';
import bucketModel from '../model/bucket.model';
import { Validator } from '../model/validator.interface';

export class BucketRepo {
  private model = bucketModel;

  public async findAll() {
    return this.model.find({});
  }

  public async findByID(id: string) {
    return this.model.findOne({ id });
  }

  public async findByIDs(ids: string) {
    return this.model.find({ id: { $in: ids } });
  }

  public async create(bucket: Bucket) {
    return this.model.create(bucket);
  }

  public async bulkInsert(...models: Bucket[]) {
    return this.model.create(models);
  }

  public async deleteAll() {
    return this.model.deleteMany({});
  }
}

export default BucketRepo;