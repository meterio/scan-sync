import BigNumber from 'bignumber.js';

export interface TokenProfile {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  officialSite: string;
  totalSupply: BigNumber;
}
