#!/usr/bin/env node
require('./utils/validateEnv');

import { serveAPI } from './api/server';
import { CMD } from './cmd/cmd';
import { MetricCMD } from './cmd/metric.cmd';
import { NFTCMD } from './cmd/nft.cmd';
import { PosCMD } from './cmd/pos.cmd';
import { PowCMD } from './cmd/pow.cmd';
import { ScriptEngineCMD } from './cmd/scriptEngine.cmd';
import { Network } from './const';
import { connectDB, disconnectDB } from './utils/db';

const commander = require('commander');
const program = new commander.Command();

const runSync = async (task, options) => {
  console.log(`start to sync on network ${options.network} ${!!options.standby} ${task}`);
  await connectDB(options.network, !!options.standby);
  //   await cmd.start();
  let cmd: CMD;
  switch (task) {
    case 'pos':
      cmd = new PosCMD(options.network);
      break;
    case 'pow':
      cmd = new PowCMD(options.network);
      break;
    case 'nft':
      cmd = new NFTCMD(options.network);
      break;
    case 'metric':
      cmd = new MetricCMD(options.network);
      break;
    case 'scriptengine':
      cmd = new ScriptEngineCMD(options.network);
      break;
    default:
      throw new commander.InvalidArgumentError('Not a valid task to sync');
  }
  console.log('start the cmd');
  await cmd.start();
  await disconnectDB();
};

const runAPI = async (options) => {
  console.log(`start query api`);
  await connectDB(options.network, !!options.standby);
  await serveAPI(options.network, !!options.standby, options.port);
  await disconnectDB();
};

const parsePort = (value) => {
  try {
    let port = Number(value);
    if (port > 1000 && port < 65536) {
      return port;
    }
  } catch (e) {
    throw new commander.InvalidArgumentError('Not a valid port number');
  }
};

const parseNetwork = (value) => {
  let network: Network;
  switch (value) {
    case 'main':
    case 'metermain':
      network = Network.MainNet;
      break;
    case 'test':
    case 'metertest':
      network = Network.TestNet;
      break;
    case 'verse-test':
      network = Network.VerseTest;
      break;
    case 'verse-main':
      network = Network.VerseMain;
      break;
    default:
      throw new commander.InvalidArgumentError('Not a valid network');
  }
  return network;
};

program
  .command('sync')
  .argument('<task>', 'task to run')
  .requiredOption('-n, --network <network>', 'Network to use', parseNetwork)
  .option('-s, --standby', 'Standby mode')
  .action(runSync);
program
  .command('api')
  .requiredOption('-n, --network <network>', 'Network to use', parseNetwork)
  .requiredOption('-p, --port <port>', 'Port to listen', parsePort)
  .option('-s, --standby', 'Standby mode')
  .action(runAPI);

(async () => {
  await program.parseAsync(process.argv);
})();
