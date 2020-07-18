import { Network, getVIP180Token } from './const';
import { PosChain } from './processor/pos-chain';
import { Meter } from './meter-rest';
import { createConnection, getConnectionOptions } from 'typeorm';
import { Net } from './net';
import { getMeterREST } from './utils';
import { Processor } from './processor/processor';
import * as logger from './logger';
import { AssetTrack } from './processor/asset-track';

const printUsage = (msg = '') => {
  logger.error(`${
    msg ? msg + '\n\n' : ''
  }Usage: node main.js [Network] [Task] [...Args]
--------
Network:    [mainnet|testnet|devnet]
Task:       [pos-chain|asset-track]`);
  process.exit(-1);
};

if (process.argv.length < 4) {
  printUsage();
  process.exit(-1);
}

let net: Network;
switch (process.argv[2]) {
  case 'mainnet':
    net = Network.MainNet;
    break;
  case 'testnet':
    net = Network.TestNet;
    break;
  case 'devnet':
    net = Network.DevNet;
    break;
  default:
    printUsage('invalid network');
}

const meter = new Meter(new Net(getMeterREST()), net!);

let task: Processor;
switch (process.argv[3]) {
  case 'pos-chain':
    task = new PosChain(meter);
    break;
  case 'asset-track':
    task = new AssetTrack(meter);
    break;
  default:
    printUsage('invalid task name');
}
let shutdown = false;

(async () => {
  try {
    const opt = await getConnectionOptions();
    await createConnection();
    await task.start();
  } catch (e) {
    logger.error(
      `Start task(${process.argv[3]}) at Net(${process.argv[2]}): ` +
        (e as Error).stack
    );
    process.exit(-1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach((sig) => {
    process.on(sig, (s) => {
      process.stdout.write(`got signal: ${s}, terminating
`);
      if (!shutdown) {
        shutdown = true;
        task.stop().then(() => {
          process.exit(0);
        });
      }
    });
  });
})();
