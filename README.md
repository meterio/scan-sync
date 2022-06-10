# Scan Sync

Scan the Meter blockchain and transform interested data into a MongoDB.

## Workflow

```
+----------------+       +--------------+        +----------------+
|                |       |              |        |                |
| Meter FullNode +-----> +   Base DB    +------->+ Defined Entity |
|                |       |              |        |                |
+----------------+       +--------------+        +----------------+
```

- `Base DB`: Blocks/TXs/PowBlocks/PowTxs/Receipts
- `Defined Entity`: Balances/Transfers/ etc

## Features

- Blocks/TXs/Receipts
- Committee/Epoch
- MTR/MTRG Native Balance and Transfer
- MTR/MTRG System Contract Transfer
- ERC20 Token Balance and Transfer
- Staking Engine (incomplete)
- Auction Engine (incomplete)
- AccountLock Engine (incomplete)

## Usage as Cli

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

# look at .env.sample
```

3. Run sync

```bash
dotenv -e env.prod scan-sync main pos
```

## Usage Typescript, Run with source code

```
ts-node main.ts [Network] [Task]

Network: [main|test|main-standby|test-standby|verse-main|verse-test]
Task: [pos|pow|metric|scriptengine]
```

## Usage Daemon, Run with binary

```bash
// notice Network & Task

nohup dotenv -e env.prod scan-sync main pos >> ~/pos-sync.log 2>&1 &
```
