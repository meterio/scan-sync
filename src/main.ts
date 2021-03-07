#!/usr/bin/env node
require('./utils/validateEnv');

// other imports
import * as Logger from 'bunyan';
import mongoose from 'mongoose';

import * as pkg from '../package.json';
import { AccountCMD } from './cmd/account.cmd';
import { CMD } from './cmd/cmd';
import { ERC20CMD } from './cmd/erc20.cmd';
import { MetricCMD } from './cmd/metric.cmd';
import { PosCMD } from './cmd/pos.cmd';
import { PowCMD } from './cmd/pow.cmd';
import { ScriptEngineCMD } from './cmd/scriptEngine.cmd';
import { Network } from './const/network';
import { connectDB } from './utils/db';

const log = Logger.createLogger({ name: 'main' });

export const error = (message: string) => {
  if (!message.endsWith('\n')) {
    message = message + '\n';
  }
  process.stderr.write(message);
};

const printVersion = () => {
  console.log('NAME: ', pkg.name);
  console.log('VERSION: ', pkg.version);
};

const printUsage = (msg = '') => {
  error(`${msg ? msg + '\n\n' : ''}Usage: node index.js [Network][Task][...Args]
--------
Network:    [main|test]
Task:       [pos|pow|account|erc20|metric|scriptengine]`);
  process.exit(-1);
};

if (process.argv.length < 4) {
  if ((process.argv.length >= 3 && process.argv[2] === '-v') || process.argv[2] === 'version') {
    printVersion();
    process.exit(0);
  }
  printUsage();
  process.exit(-1);
}

let net: Network;
switch (process.argv[2]) {
  case 'main':
    net = Network.MainNet;
    break;
  case 'test':
    net = Network.TestNet;
    break;
  case 'dev':
    net = Network.DevNet;
    break;
  default:
    printUsage('invalid network');
}

let cmd: CMD;
switch (process.argv[3]) {
  case 'pos':
    cmd = new PosCMD(net);
    break;
  case 'pow':
    cmd = new PowCMD(net);
    break;
  case 'account':
    cmd = new AccountCMD(net);
    break;
  case 'erc20':
    cmd = new ERC20CMD(net);
    break;
  case 'metric':
    cmd = new MetricCMD(net);
    break;
  case 'scriptengine':
    cmd = new ScriptEngineCMD(net);
    break;
  default:
    printUsage('invalid cmd name');
}

(async () => {
  // const blockQueue = new BlockQueue('block');
  let shutdown = false;

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach((sig) => {
    process.on(sig, async (s) => {
      process.stdout.write(`Got signal: ${s}, terminating...\n`);
      if (!shutdown) {
        shutdown = true;
        await mongoose.disconnect();
        await cmd.stop();
        process.exit(0);
      }
    });
  });

  try {
    await connectDB(net);
    await cmd.start();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();
