#!/usr/bin/env node
require('./utils/usage');
require('./utils/validateEnv');

import { Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';
// other imports
import * as Logger from 'bunyan';

import * as pkg from '../package.json';
import { CMD } from './cmd/cmd';
import { MetricCMD } from './cmd/metric.cmd';
import { PosCMD } from './cmd/pos.cmd';
import { PowCMD } from './cmd/pow.cmd';
import { ScriptEngineCMD } from './cmd/scriptEngine.cmd';
import { printUsage } from './utils/usage';

const log = Logger.createLogger({ name: 'main' });

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
  case 'main-standby':
    net = Network.MainNetStandBy;
    break;
  case 'test-standby':
    net = Network.TestNetStandBy;
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
  case 'metric':
    cmd = new MetricCMD(net);
    break;
  case 'scriptengine':
    cmd = new ScriptEngineCMD(net);
    break;
  case 'version':
    console.log('version: ', pkg.version);
    process.exit(0);

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
        await disconnectDB();
        await cmd.stop();
        process.exit(0);
      }
    });
  });

  try {
    log.info({ version: pkg.version, cmd: process.argv[3], network: process.argv[2], genesis: net }, 'start cmd');
    await connectDB(net);
    await cmd.start();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();
