export enum Token {
  STPT = 0,
  STPD,
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
  COST_PARITY = 'cost_parity',
  REWARD_PER_DAY = 'reward_per_day',
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
  STAKEHOLDER_COUNT = 'stakehodler_count',
  STAKEHOLDERS = 'stakeholders',
  MTR_CIRCULATION = 'mtr_circulation',
  MTRG_CIRCULATION = 'mtrg_circulation',
  PRESENT_AUCTION = 'present_auction',
  AUCTION_SUMMARIES = 'auction_summaries',
  VALIDATOR_REWARDS = 'validator_rewards',
  BTC_HASHRATE = 'btc_hashrate',
  BTC_PRICE = 'btc_price',
  COEF = 'coef',
  STATS = 'stats',
  INVALID_NODES = 'invalid_nodes',
  INVALID_NODES_COUNT = 'invalid_nodes_count',
  MTRG_STAKED = 'mtrg_staked',
  MTRG_STAKED_LOCKED = 'mtrg_staked_locked',
}

export enum ValidatorStatus {
  CANDIDATE = 0,
  DELEGATE,
  JAILED,
}

export const enumKeys = (es: any) => Object.values(es).filter((x) => typeof x === 'string');
