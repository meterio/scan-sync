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

export const enumKeys = (es: any) => Object.values(es).filter((x) => typeof x === 'string');
