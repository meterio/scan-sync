import { Network } from '@meterio/scan-db/dist';
export * from './address';
export * from './genesis';
export * from './token';
export * from './abi';
export * from './model';

export const RECENT_WINDOW = 5;
export const UNIT_SHANNON = 1e9;
export const UNIT_WEI = 1e18;

const TESTNET_PROVIDER_URL = 'http://warringstakes.meter.io';
const TESTNET_POW_RPC_HOST = 's03.meter.io';
const TESTNET_POW_RPC_PORT = 8332;
const TESTNET_POW_RPC_USER = 'testuser';
const TESTNET_POW_RPC_PWD = 'testpass';

const MAINNET_PROVIDER_URL = 'http://rpc-trace.meter.io:8669';
const MAINNET_POW_RPC_HOST = 'c03.meter.io';
const MAINNET_POW_RPC_PORT = 8332;
const MAINNET_POW_RPC_USER = 'testuser';
const MAINNET_POW_RPC_PWD = 'testpass';

export const getNetwork = (network: string) => {
  switch (network.toLowerCase()) {
    case 'devnet':
      return Network.DevNet;
    case 'testnet':
      return Network.TestNet;
    case 'mainnet':
      return Network.MainNet;
  }
  return Network.TestNet;
};

export const GetPowConfig = (network: Network) => {
  if (network === Network.MainNet || network === Network.MainNetStandBy) {
    return {
      username: MAINNET_POW_RPC_USER,
      password: MAINNET_POW_RPC_PWD,
      host: MAINNET_POW_RPC_HOST,
      port: MAINNET_POW_RPC_PORT,
    };
  }
  if (network === Network.TestNet || network === Network.TestNetStandBy) {
    return {
      username: TESTNET_POW_RPC_USER,
      password: TESTNET_POW_RPC_PWD,
      host: TESTNET_POW_RPC_HOST,
      port: TESTNET_POW_RPC_PORT,
    };
  }
};

export const GetPosConfig = (network: Network) => {
  if (network === Network.MainNet || network === Network.MainNetStandBy) {
    return {
      url: MAINNET_PROVIDER_URL,
    };
  }
  if (network === Network.TestNet || network === Network.TestNetStandBy) {
    return {
      url: TESTNET_PROVIDER_URL,
    };
  }
};

export const ENERGY_SYM = 'MTR';
export const BALANCE_SYM = 'MTRG';
