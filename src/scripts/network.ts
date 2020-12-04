import { Block } from 'bitcoinjs-lib';

import { Network } from '../const';
import BlockRepo from '../repo/block.repo';

export const getNetwork = () => {
  let net: Network;

  switch (process.argv[2]) {
    case 'main':
      net = Network.MainNet;
      break;
    case 'test':
      net = Network.TestNet;
      break;
    case undefined:
      net = Network.MainNet;
      break;
    default:
      throw new Error('invalid network');
  }
  return net!;
};

export const checkNetworkWithDB = async (net: Network) => {
  const blockRepo = new BlockRepo();
  const gene = await blockRepo.findByNumber(0);

  if (gene.hash !== net) {
    throw new Error('network mismatch with genesis in db');
  }
};
