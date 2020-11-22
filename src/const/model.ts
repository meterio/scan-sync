export enum Token {
  MTR = 0,
  MTRG,
  ERC20,
}

export enum BlockType {
  MBlock,
  KBlock,
}

export const enumKeys = (es: any) => Object.values(es).filter((x) => typeof x === 'string');
