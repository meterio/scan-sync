import { Network } from './network';
export * from './address';
export * from './genesis';
export * from './network';
export * from './token';
export * from './abi';
export * from './model';

export const RECENT_WINDOW = 5;
export const UNIT_SHANNON = 1e9;
export const UNIT_WEI = 1e18;

const TESTNET_PROVIDER_URL = 'http://172.31.37.70:8669';
const TESTNET_POW_RPC_HOST = 's03.meter.io';
const TESTNET_POW_RPC_PORT = 8332;
const TESTNET_POW_RPC_USER = 'testuser';
const TESTNET_POW_RPC_PWD = 'testpass';

const MAINNET_PROVIDER_URL = 'http://13.214.56.167:8669';
const MAINNET_POW_RPC_HOST = 'c03.meter.io';
const MAINNET_POW_RPC_PORT = 8332;
const MAINNET_POW_RPC_USER = 'testuser';
const MAINNET_POW_RPC_PWD = 'testpass';

export const GetPowConfig = (network: Network) => {
  if (network === Network.MainNet) {
    return {
      username: MAINNET_POW_RPC_USER,
      password: MAINNET_POW_RPC_PWD,
      host: MAINNET_POW_RPC_HOST,
      port: MAINNET_POW_RPC_PORT,
    };
  }
  if (network === Network.TestNet) {
    return {
      username: TESTNET_POW_RPC_USER,
      password: TESTNET_POW_RPC_PWD,
      host: TESTNET_POW_RPC_HOST,
      port: TESTNET_POW_RPC_PORT,
    };
  }
};

export const GetPosConfig = (network: Network) => {
  if (network === Network.MainNet) {
    return {
      url: MAINNET_PROVIDER_URL,
    };
  }
  if (network === Network.TestNet) {
    return {
      url: TESTNET_PROVIDER_URL,
    };
  }
};
