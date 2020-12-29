import mongoose from 'mongoose';

import { Network } from '../const';

const { MONGO_USER, MONGO_PWD, MONGO_PATH, MONGO_SSL_CA } = process.env;

export const connectDB = async (network: Network) => {
  let dbName = 'scandb';
  switch (network) {
    case Network.MainNet:
      dbName = 'scandb-mainnet';
      break;
    case Network.TestNet:
      dbName = 'scandb-testnet';
      break;
    case Network.DevNet:
      dbName = 'scandb-devnet';
      break;
  }
  console.log(`connect to DB path: ${MONGO_PATH}/${dbName}`);
  let url = `mongodb://${MONGO_USER}:${MONGO_PWD}@${MONGO_PATH}/${dbName}`;
  let options: mongoose.ConnectionOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
  };
  if (MONGO_SSL_CA != '') {
    const fs = require('fs');
    //Specify the Amazon DocumentDB cert
    var ca = [fs.readFileSync(MONGO_SSL_CA)];
    url += '?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred';
    options = {
      ...options,
      sslValidate: true,
      sslCA: ca,
      useNewUrlParser: true,
      // readConcern: { level: 'majority' },
      // w: 'majority',
      readPreference: 'primary',
    };
  }
  // mongoose.set("debug", true);
  await mongoose.connect(url, options);
};
