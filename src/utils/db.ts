import mongoose from 'mongoose';

import { Network } from '../const';

const { MONGO_USER, MONGO_PWD, MONGO_PATH, MONGO_SSL_CA } = process.env;

export const connectDB = async (network: Network) => {
  let dbName = 'scandb';
  switch (network) {
    case Network.MainNet:
      dbName = 'scanv2-main';
      break;
    case Network.TestNet:
      dbName = 'scanv2-test';
      break;
    case Network.DevNet:
      dbName = 'scanv2-dev';
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
  let query: { [key: string]: string } = {};
  query['retryWrites'] = 'false';
  if (MONGO_SSL_CA != '') {
    const fs = require('fs');
    //Specify the Amazon DocumentDB cert
    var ca = [fs.readFileSync(MONGO_SSL_CA)];
    query['ssl'] = 'true';
    query['replicaSet'] = 'rs0';
    query['readPreference'] = 'secondaryPreferred';
    // url += '?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred';
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
  let queries = [];
  for (const key in query) {
    queries.push(`${key}=${query[key]}`);
  }
  let queryStr = queries.join('&');
  // mongoose.set("debug", true);
  await mongoose.connect(queryStr ? url + '?' + queryStr : url, options);
};
