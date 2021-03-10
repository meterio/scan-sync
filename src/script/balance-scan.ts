require('../utils/validateEnv');

import mongoose from 'mongoose';

import { GetPosConfig, Network } from '../const';
import { Net } from '../utils';
import { Balance } from './types/balance';

const network = Network.TestNet;
const posConfig = GetPosConfig(network);
const net = new Net(posConfig.url);
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: ts-node single-account-check.ts [address]');
  process.exit(-1);
}
const acctAddress = args[0];

let revision = 252700;

const processAccount = async () => {
  const startAcct = await net.http<any>('GET', `accounts/${acctAddress}?revision=${revision}`);
  let curBalance = new Balance(
    acctAddress,
    startAcct.energy,
    startAcct.balance,
    startAcct.boundenergy,
    startAcct.boundbalance
  );
  console.log('start balance: ', curBalance.String());
  const best = await net.http<any>('GET', `blocks/best`);
  console.log(best.number);
  for (; revision < best.number; revision++) {
    console.log('checking', revision);
    const acct = await net.http<any>('GET', `accounts/${acctAddress}?revision=${revision}`);
    const balance = new Balance(acctAddress, acct.energy, acct.balance, acct.boundenergy, acct.boundbalance);
    if (balance.String() !== curBalance.String()) {
      console.log('revision:', revision, 'changed to :', balance.String());
      curBalance = balance;
    }
  }
};

(async () => {
  try {
    await processAccount();
    await mongoose.disconnect();
  } catch (e) {
    console.log('error happened: ', e);
  }
})();