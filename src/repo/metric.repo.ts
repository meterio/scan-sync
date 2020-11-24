import { MetricType } from '../const';
import metricModel from '../model/metric.model';

export class MetricRepo {
  private metric = metricModel;

  public async findByKey(key: string) {
    return this.metric.findOne({ key });
  }

  public async findByKeys(keys: string[]) {
    return this.metric.find({ key: { $in: keys } });
  }

  public async exist(key: string) {
    return this.metric.exists({ key });
  }

  public async create(key: string, value: string, type: MetricType) {
    return this.metric.create({ key, value, type });
  }

  public async update(key: string, value: string) {
    return this.metric.updateOne({ key }, { $set: { value } });
  }
}

export default MetricRepo;
