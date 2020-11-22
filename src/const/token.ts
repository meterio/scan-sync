import { Token } from './model';
import { Network } from './network';

export interface TokenBasic {
  name: string;
  address: string;
  token: Token;
  decimals: number;
}

export const MTRSystemContract = {
  token: Token.MTR,
  address: '0x687A6294D0D6d63e751A059bf1ca68E4AE7B13E2',
  name: 'Meter ERC20',
  decimals: 18,
};
export const MTRGSystemContract = {
  token: Token.MTRG,
  address: '0x89827f7bb951fd8a56f8ef13c5bfee38522f2e1f',
  name: 'Meter Governance ERC20',
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

mainnet.add(MTRSystemContract);
mainnet.add(MTRGSystemContract);

testnet.add({ ...MTRSystemContract, address: '' });
testnet.add({ ...MTRGSystemContract, address: '' });

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
