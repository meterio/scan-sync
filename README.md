# Scan Sync

Sync the MongoDB with transform interested data collected from Meter Network API.

## Workflow

```
+----------------+       +--------------+        +----------------+
|                |       |              |        |                |
| Meter FullNode +-----> +   MongoDB    +------->+ Defined Entity |
|                |       |              |        |                |
+----------------+       +--------------+        +----------------+
```

- `Foundation DB`: Blocks/TXs/PowBlocks/PowTxs/Outputs
- `Defined Entity`: Balances/Transfers etc

## Features

- Blocks/TXs/Receipts
- MTR/MTRG Balance and Transfer
- ERC20 Token Balance and Transfer

## Usage

1. Install dependency

```
npm install -g @meterio/scan-sync dotenv-cli
```

2. Prepare env file with these information

```
# database
MONGO_PATH=127.0.0.1:27017/scandb
MONGO_PWD=scan
MONGO_USER=scan
MONGO_SSL_CA=

POS_PROVIDER_URL=http://mainnet.meter.io:8669

POW_RPC_HOST=c03.meter.io
POW_RPC_PORT=8332
POW_RPC_USER=testuser
POW_RPC_PWD=testpass
```

3. Run sync

```bash
dotenv -e env.prod scan-sync main pos
```

## Usage

```
node index.js [Network][task][...Args]

Network: [main|test]
Task: [pos|pow|native-token|erc20-token]`);
```

## Daemon

```
nohup dotenv -e env.prod scan-sync main pos >> ~/pos-sync.log 2>&1 &
```
