import mongoose from 'mongoose';

const { MONGO_USER, MONGO_PWD, MONGO_PATH, MONGO_SSL_CA } = process.env;

export const connectDB = async () => {
  let url = `mongodb://${MONGO_USER}:${MONGO_PWD}@${MONGO_PATH}`;
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
    };
  }
  // mongoose.set("debug", true);
  await mongoose.connect(url, options);
};
