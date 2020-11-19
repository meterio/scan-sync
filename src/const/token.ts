import { Token } from './model';
import { Network } from './network';

export interface TokenBasic {
  name: string;
  address: string;
  token: Token;
  decimals: number;
}

const mtr = { token: Token.MTR, address: '', name: 'Meter ERC20', decimals: 18 };
const mtrg = { token: Token.MTRG, address: '', name: 'Meter Governance ERC20', decimals: 18 };

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

mainnet.add({ ...mtr, address: '0x687A6294D0D6d63e751A059bf1ca68E4AE7B13E2' });
mainnet.add({ ...mtrg, address: '0x89827f7bb951fd8a56f8ef13c5bfee38522f2e1f' });

testnet.add({ ...mtr, address: '' });
testnet.add({ ...mtrg, address: '' });

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
