#!/usr/bin/env node
require('../utils/validateEnv');

import { ERC20 } from '@meterio/devkit';
import { BigNumber, Token, ContractRepo, connectDB, disconnectDB, ContractType } from '@meterio/scan-db/dist';
import { Pos, checkNetworkWithDB, getNetworkFromCli } from '../utils';

const adjustTotalSupply = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const contractRepo = new ContractRepo();
  const pos = new Pos(network);
  await checkNetworkWithDB(network);

  const contracts = await contractRepo.findByType(ContractType.ERC20);
  console.log(`start checking ${contracts.length} contracts...`);
  let updateCount = 0;
  for (const p of contracts) {
    try {
      const ret = await pos.explain(
        { clauses: [{ to: p.address, value: '0x0', data: ERC20.totalSupply.encode(), token: Token.MTR }] },
        'best'
      );
      const decoded = ERC20.totalSupply.decode(ret[0].data);
      const amount = decoded['0'];
      let updated = false;
      if (!p.totalSupply.isEqualTo(amount)) {
        console.log(`Update total supply for token ${p.symbol} from ${p.totalSupply.toFixed(0)} to ${amount}`);
        p.totalSupply = new BigNumber(amount);
        updated = true;
      }
      if (updated) {
        updateCount++;
        await p.save();
      }
    } catch (e) {
      console.log('ignore error: ', e);
    }
  }
  console.log(`Updated ${updateCount} token contracts`);
};

(async () => {
  try {
    await adjustTotalSupply();
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();
