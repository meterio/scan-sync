import { ValidatorStatus } from '../const';

export interface Distributor {
  address: string;
  shares: number;
}

export interface Validator {
  pubKey: string; // primary key

  // updatable attributes
  name: string;
  address: string;
  ipAddress: string;
  port: number;
  commission: number;

  status: ValidatorStatus;

  // candidate
  buckets: string[];

  // jailed fields
  totalPoints?: number;
  bailAmount?: string;
  jailedTime?: string;
  infractions?: string;

  // only delegate has this field
  distributors?: Distributor[];
}
