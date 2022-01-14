import { Token } from './model';
import { Network } from './network';
import { SystemCoinContractAddress, SystemTokenContractAddress } from './address';

export interface TokenBasic {
  name: string;
  address: string;
  token: Token;
  decimals: number;
}

export const SystemCoinContract = {
  token: Token.STPT,
  address: SystemCoinContractAddress,
  name: 'STP Token ERC20',
  decimals: 18,
};
export const SystemTokenContract = {
  token: Token.STPD,
  address: SystemTokenContractAddress,
  name: 'Verse Network ERC20',
  decimals: 18,
};

class TokenRegistry {
  private registry = new Map<Token, TokenBasic>();
  public add(tb: TokenBasic) {
    this.registry.set(tb.token, tb);
  }

  public get(token: Token) {
    if (this.registry.has(token)) {
      return this.registry.get(token);
    }
  }

  public has(token: Token) {
    return this.registry.has(token);
  }
}
const mainnet = new TokenRegistry();
const testnet = new TokenRegistry();
const devnet = new TokenRegistry();
const knownTokens = new Map<Network, TokenRegistry>();

mainnet.add(SystemCoinContract);
mainnet.add(SystemTokenContract);

testnet.add(SystemCoinContract);
testnet.add(SystemTokenContract);

knownTokens.set(Network.MainNet, mainnet);
knownTokens.set(Network.TestNet, testnet);
knownTokens.set(Network.DevNet, devnet);

export const getERC20Token = (net: Network, token: Token) => {
  const registry = knownTokens.get(net);
  if (registry.has(token)) {
    return registry.get(token);
  }
  return undefined;
};
