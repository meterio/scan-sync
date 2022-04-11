import { Network, Token } from '@meterio/scan-db/dist';
export interface TokenBasic {
  name: string;
  address: string;
  token: Token;
  decimals: number;
}

export const MTRSystemContract = {
  token: Token.MTR,
  address: '0x687A6294D0D6d63e751A059bf1ca68E4AE7B13E2'.toLowerCase(),
  name: 'Meter ERC20',
  decimals: 18,
};
export const MTRGSystemContract = {
  token: Token.MTRG,
  address: '0x228ebBeE999c6a7ad74A6130E81b12f9Fe237Ba3'.toLowerCase(),
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

export const getERC20Token = (net: Network, token: Token) => {
  const registry = knownTokens.get(net);
  if (registry.has(token)) {
    return registry.get(token);
  }
  return undefined;
};
