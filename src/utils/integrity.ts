import { BlockRepo, Network } from '@meterio/scan-db/dist';
import { Pos } from './pos-rest';

export const checkNetworkWithDB = async (net: Network) => {
  // FIXME: should check db with chain
  const blockRepo = new BlockRepo();
  const gene = await blockRepo.findByNumber(0);
  const pos = new Pos(net);
  const geneChain = await pos.getBlock(0, 'regular');
  if (gene.hash !== geneChain.id) {
    throw new Error('network mismatch with genesis in db');
  }
};
