export enum Token {
  MTR = 0,
  MTRG,
  ERC20,
}

export enum BlockType {
  MBlock,
  KBlock,
}

export enum MetricType {
  NUM = 0,
  BIGNUM,
  STRING,
}

export enum MetricName {
  DIFFICULTY = 'difficulty',
  HASHRATE = 'networkhashps',
  EPOCH = 'epoch',
  SEQ = 'seq',
  KBLOCK = 'kblock',
  POS_BEST = 'pos_best',
  POW_BEST = 'pow_best',
  MTRG_PRICE = 'mtrg_price',
  MTRG_PRICE_CHANGE = 'mtrg_price_change',
  MTR_PRICE = 'mtr_price',
  MTR_PRICE_CHANGE = 'mtr_price_change',
  CANDIDATES = 'candidates',
  DELEGATES = 'delegates',
  BUCKETS = 'buckets',
  JAILED = 'jailed',
  CANDIDATE_COUNT = 'candidate_count',
  DELEGATE_COUNT = 'delegate_count',
  BUCKET_COUNT = 'bucket_count',
  JAILED_COUNT = 'jailed_count',
}

export enum ValidatorStatus {
  CANDIDATE = 0,
  DELEGATE,
  JAILED,
}

export const enumKeys = (es: any) => Object.values(es).filter((x) => typeof x === 'string');
