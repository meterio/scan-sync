import { MetricType } from '../const/model';

export interface Metric {
  key: string;
  value: string;
  type: MetricType;

  createdAt?: number;
  updatedAt?: number;
}
