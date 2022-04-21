import { bool, cleanEnv, num, port, str } from 'envalid';

function validateEnv() {
  cleanEnv(process.env, {
    // mongo
    MONGO_PATH: str(),
    MONGO_USER: str(),
    MONGO_PWD: str(),
    MONGO_SSL_CA: str(),

    // pow rpc
    MAINNET_POW_RPC_HOST: str(),
    TESTNET_POW_RPC_HOST: str(),

    // restful api
    MAINNET_RESTFUL_ENDPOINT: str(),
    TESTNET_RESTFUL_ENDPOINT: str(),
    VERSE_RESTFUL_ENDPOINT: str(),
    VERSE_TEST_RESTFUL_ENDPOINT: str(),

    ENABLE_AUCTION: bool(),
    ENABLE_SOURCIFY: bool(),
  });
}

require('dotenv').config();
validateEnv();
