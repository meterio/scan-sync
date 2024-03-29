#!/usr/bin/env node
require('../utils/validateEnv');

import { AccountRepo, BigNumber, HeadRepo, Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { Pos, checkNetworkWithDB, fromWei, getNetworkFromCli } from '../utils';

const audit = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const accountRepo = new AccountRepo();
  const pos = new Pos(network);
  await checkNetworkWithDB(network);

  const posHead = await headRepo.findByKey('pos');
  console.log('POS Head:', posHead);

  let revision = '';
  if (network === Network.TestNet) {
    revision = '' + posHead.num;
  } else {
    revision = '' + posHead.num;
  }
  console.log(`Adjust account balances based on revision: ${revision}`);

  const accounts = await accountRepo.findAll();
  console.log(`start checking ${accounts.length} accounts...`);
  let n = 1;
  let mtrDeltas = new BigNumber(0);
  let beneficiaryDelta = new BigNumber(0);

  for (const acc of accounts) {
    const chainAcc = await pos.getAccount(acc.address, revision);

    const balance = new BigNumber(chainAcc.balance);
    const energy = new BigNumber(chainAcc.energy);
    const boundedBalance = new BigNumber(chainAcc.boundbalance);
    const boundedEnergy = new BigNumber(chainAcc.boundenergy);
    if (
      acc.mtrgBalance.toFixed() !== balance.toFixed() ||
      acc.mtrBalance.toFixed() !== energy.toFixed() ||
      acc.mtrgBounded.toFixed() !== boundedBalance.toFixed() ||
      acc.mtrBounded.toFixed() !== boundedEnergy.toFixed()
    ) {
      const preMTR = acc.mtrBalance;
      const preMTRG = acc.mtrgBalance;
      const preBoundedMTR = acc.mtrBounded;
      const preBoundedMTRG = acc.mtrgBounded;

      console.log('-'.repeat(50));
      console.log(`Found mismatching Account(${acc.address}):`);
      if (!preMTR.isEqualTo(energy)) {
        console.log(`MTR: ${fromWei(preMTR)} -> ${fromWei(energy)} `);
      }
      if (!preMTRG.isEqualTo(balance)) {
        console.log(`MTRG: ${fromWei(preMTRG)} -> ${fromWei(balance)}`);
      }
      if (!preBoundedMTR.isEqualTo(boundedEnergy)) {
        console.log(`Bounded MTR: ${fromWei(preBoundedMTR)} -> ${fromWei(boundedEnergy)}`);
      }
      if (!preBoundedMTRG.isEqualTo(boundedBalance)) {
        console.log(`Bounded MTRG: ${fromWei(preBoundedMTRG)} -> ${fromWei(boundedBalance)}`);
      }

      if (acc.address != '0x8a80c791b1e6dc10849ed52e69a4bb285e7472be') {
        mtrDeltas = mtrDeltas.plus(energy).minus(preMTR);
      } else {
        beneficiaryDelta = beneficiaryDelta.plus(energy).minus(preMTR);
      }
    }
    if (n % 500 == 0) {
      console.log(`checked ${n} accounts`);
    }
  }

  console.log('deltas: ', fromWei(mtrDeltas));
  console.log('sys bene deltas: ', fromWei(beneficiaryDelta));
};

(async () => {
  try {
    await audit();
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();
