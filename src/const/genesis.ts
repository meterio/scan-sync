import { ExecutorAddress, ExtensionAddress, ParamsAddress, PrototypeAddress } from './address';
import { Network } from './network';

const uint8ToAddress = (input: number) => '0x' + Buffer.alloc(1).fill(input).toString('hex').padStart(40, '0');

const preCompiledContract = [uint8ToAddress(1)];
export const getPreAllocAccount = (net: Network) => {
  if (net === Network.MainNet) {
    return [ParamsAddress, ExecutorAddress, PrototypeAddress, ExtensionAddress, ...preCompiledContract, ...mainnet];
  } else if (net === Network.TestNet) {
    return [ParamsAddress, PrototypeAddress, ExtensionAddress, ...preCompiledContract, ...testnet];
  } else {
    throw new Error('unknown network: ' + net);
  }
};

const mainnet = [];

const testnet: string[] = [];
