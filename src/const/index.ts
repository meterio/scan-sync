import { Network } from '@meterio/scan-db/dist';
export * from './address';
export * from './genesis';
export * from './token';
export * from './abi';
export * from './model';

export const RECENT_WINDOW = 5;
export const UNIT_SHANNON = 1e9;
export const UNIT_WEI = 1e18;

const {
  TESTNET_RESTFUL_ENDPOINT,
  TESTNET_POW_RPC_HOST,
  MAINNET_RESTFUL_ENDPOINT,
  MAINNET_POW_RPC_HOST,
  VERSE_RESTFUL_ENDPOINT,
  VERSE_TEST_RESTFUL_ENDPOINT,
} = process.env;

const TESTNET_POW_RPC_PORT = 8332;
const TESTNET_POW_RPC_USER = 'testuser';
const TESTNET_POW_RPC_PWD = 'testpass';

const MAINNET_POW_RPC_PORT = 8332;
const MAINNET_POW_RPC_USER = 'testuser';
const MAINNET_POW_RPC_PWD = 'testpass';

export const GetNetworkConfig = (net: Network) => {
  switch (net) {
    case Network.MainNet:
      return {
        username: MAINNET_POW_RPC_USER,
        password: MAINNET_POW_RPC_PWD,
        host: MAINNET_POW_RPC_HOST,
        port: MAINNET_POW_RPC_PORT,
        posUrl: MAINNET_RESTFUL_ENDPOINT,

        powEnabled: true,
        auctionEnabled: true,
        sourcifyEnabled: true,

        coingeckoEnergy: 'meter-stable',
        coingeckoBalance: 'meter',
      };
    case Network.TestNet:
      return {
        username: TESTNET_POW_RPC_USER,
        password: TESTNET_POW_RPC_PWD,
        host: TESTNET_POW_RPC_HOST,
        port: TESTNET_POW_RPC_PORT,
        posUrl: TESTNET_RESTFUL_ENDPOINT,

        powEnabled: true,
        auctionEnabled: true,
        sourcifyEnabled: true,

        coingeckoEnergy: 'meter-stable',
        coingeckoBalance: 'meter',
      };
    case Network.VerseMain: {
      return {
        posUrl: VERSE_RESTFUL_ENDPOINT,

        powEnabled: false,
        auctionEnabled: false,
        sourcifyEnabled: false,

        coingeckoEnergy: 'meter-stable',
        coingeckoBalance: 1,
      };
    }
    case Network.VerseTest: {
      return {
        posUrl: VERSE_TEST_RESTFUL_ENDPOINT,

        powEnabled: false,
        auctionEnabled: false,
        sourcifyEnabled: false,

        coingeckoEnergy: 'stp-network',
        coingeckoBalance: 1,
      };
    }
  }
};
