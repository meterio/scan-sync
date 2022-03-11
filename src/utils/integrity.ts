import { BlockRepo, Network } from '@meterio/scan-db';

export const checkNetworkWithDB = async (net: Network) => {
  // FIXME: should check db with chain
  // const blockRepo = new BlockRepo();
  // const gene = await blockRepo.findByNumber(0);
  // if (gene.hash !== net) {
  //   throw new Error('network mismatch with genesis in db');
  // }
};
