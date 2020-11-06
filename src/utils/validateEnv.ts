import { cleanEnv, num, port, str } from 'envalid';

function validateEnv() {
  cleanEnv(process.env, {
    // mongo
    MONGO_PATH: str(),
    MONGO_USER: str(),
    MONGO_PWD: str(),
    MONGO_SSL_CA: str(),

    // pos
    POS_PROVIDER_URL: str(),
    POS_NETWORK: str(),

    // pow
    POW_RPC_HOST: str(),
    POW_RPC_PORT: num(),
    POW_RPC_USER: str(),
    POW_RPC_PWD: str(),
  });
}

require('dotenv').config();
validateEnv();
