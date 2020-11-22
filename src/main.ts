require('./utils/validateEnv');

// other imports
import * as Logger from 'bunyan';
import mongoose from 'mongoose';

import { connectDB } from './utils/db';
import { PosCMD } from './cmd/pos.cmd';
import { PowCMD } from './cmd/pow.cmd';
import { AccountCMD } from './cmd/account.cmd';
import { Network } from './const/network';
import { CMD } from './cmd/cmd';
import { ERC20CMD } from './cmd/erc20.cmd';

const log = Logger.createLogger({ name: 'main' });

export const error = (message: string) => {
  if (!message.endsWith('\n')) {
    message = message + '\n';
  }
  process.stderr.write(message);
};

const printUsage = (msg = '') => {
  error(`${msg ? msg + '\n\n' : ''}Usage: node index.js [Network][Task][...Args]
--------
Network:    [main|test]
Task:       [pos|pow|account|erc20]`);
  process.exit(-1);
};

if (process.argv.length < 4) {
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
    await connectDB();
    await cmd.start();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();
