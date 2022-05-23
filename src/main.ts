#!/usr/bin/env node
require('./utils/usage');
require('./utils/validateEnv');

import { Network, connectDB, disconnectDB, parseNetwork } from '@meterio/scan-db/dist';
// other imports
import pino from 'pino';
import * as pkg from '../package.json';
import { CMD } from './cmd/cmd';
import { MetricCMD } from './cmd/metric.cmd';
import { PosCMD } from './cmd/pos.cmd';
import { PowCMD } from './cmd/pow.cmd';
import { ScriptEngineCMD } from './cmd/scriptEngine.cmd';
import { printUsage } from './utils/usage';

const log = pino({
  transport: {
    target: 'pino-pretty',
  },
});

const parsed = parseNetwork(process.argv[2]);
if (!parsed) {
  printUsage('invalid network');
  process.exit(-1);
}
const { network, standby } = parsed;

let cmd: CMD;
switch (process.argv[3]) {
  case 'pos':
    cmd = new PosCMD(network);
    break;
  case 'pow':
    cmd = new PowCMD(network);
    break;
  case 'metric':
    cmd = new MetricCMD(network);
    break;
  case 'scriptengine':
    cmd = new ScriptEngineCMD(network);
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
    log.info({ version: pkg.version, cmd: process.argv[3], network: process.argv[2], genesis: network }, 'start cmd');
    await connectDB(network, standby);
    await cmd.start();
  } catch (e) {
    log.error({ err: e }, `start error`);
    process.exit(-1);
  }
})();
