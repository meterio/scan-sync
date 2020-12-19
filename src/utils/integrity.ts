import { Block } from 'bitcoinjs-lib';

import { Network } from '../const';
import BlockRepo from '../repo/block.repo';

export const checkNetworkWithDB = async (net: Network) => {
  const blockRepo = new BlockRepo();
  const gene = await blockRepo.findByNumber(0);

  if (gene.hash !== net) {
    throw new Error('network mismatch with genesis in db');
  }
};
