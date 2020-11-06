require('./utils/validateEnv');

// other imports
import * as Logger from 'bunyan';
import mongoose from 'mongoose';

import { connectDB } from './utils/db';
import { PosCMD } from './cmd/pos.cmd';
import { PowCMD } from './cmd/pow.cmd';
connectDB();
const log = Logger.createLogger({ name: 'main' });

(async () => {
  const posCMD = new PosCMD();
  const powCMD = new PowCMD();
  // const blockQueue = new BlockQueue('block');
  let shutdown = false;

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach((sig) => {
    process.on(sig, async (s) => {
      process.stdout.write(`Got signal: ${s}, terminating...\n`);
      if (!shutdown) {
        shutdown = true;
        await mongoose.disconnect();
        await posCMD.stop();
        // await powCMD.stop();
        process.exit(0);
      }
    });
  });

  try {
    await posCMD.start();
    // await powCMD.start();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();
