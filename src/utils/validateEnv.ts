import { cleanEnv, num, port, str } from 'envalid';

function validateEnv() {
  cleanEnv(process.env, {
    MONGO_PATH: str(),
    MONGO_USER: str(),
    MONGO_PWD: str(),
    MONGO_SSL_CA: str(),

    POS_PROVIDER_URL: str(),
    POW_RPC_URL: str(),

    QUEUE_UI_PORT: port(),
  });
}

require('dotenv').config();
validateEnv();
