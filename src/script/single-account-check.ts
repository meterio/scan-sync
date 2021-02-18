#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';

import { GetPosConfig, Network } from '../const';
import { Net, Pos, fromWei } from '../utils';

const network = Network.MainNet;
const posConfig = GetPosConfig(network);
const net = new Net(posConfig.url);
const pos = new Pos(network);
const MTRGSysContratAddr = '0x228ebBeE999c6a7ad74A6130E81b12f9Fe237Ba3'.toLowerCase();
const MTRSysContratAddr = '0x687A6294D0D6d63e751A059bf1ca68E4AE7B13E2'.toLowerCase();
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: ts-node single-account-check.ts [address]');
  process.exit(-1);
}
const acctAddress = args[0];
const acctAddressBytes32 = '0x' + acctAddress.replace('0x', '').padStart(64, '0').toLowerCase();

class Balance {
  private mtr: BigNumber;
  private mtrg: BigNumber;
  constructor(addr: string, mtr: number | string | BigNumber, mtrg: number | string | BigNumber) {
    this.mtr = new BigNumber(mtr);
    this.mtrg = new BigNumber(mtrg);
  }

  public plusMTR(amount: number | string | BigNumber) {
    this.mtr = this.mtr.plus(amount);
  }
  public plusMTRG(amount: number | string | BigNumber) {
    this.mtrg = this.mtrg.plus(amount);
  }
  public minusMTR(amount: number | string | BigNumber) {
    this.mtr = this.mtr.minus(amount);
  }
  public minusMTRG(amount: number | string | BigNumber) {
    this.mtrg = this.mtrg.minus(amount);
  }
  public MTR() {
    return this.mtr;
  }
  public MTRG() {
    return this.mtrg;
  }

  public String() {
    return `{ MTR: ${fromWei(this.mtr)}, MTRG: ${fromWei(this.mtrg)} }`;
  }
}

const handleEvent = async (evt: any) => {
  let isSend = false;
  if (!evt.topics || evt.topics.length !== 3) {
    console.log("can't handle event: ", evt);
    return;
  }
  const amount = new BigNumber(evt.data);
  let paid = new BigNumber(0);
  let mtrDelta = new BigNumber(0);
  let mtrgDelta = new BigNumber(0);
  let token = '';
  if (evt.address.toLowerCase() === MTRGSysContratAddr) {
    token = 'MTRG';
  } else if (evt.address.toLowerCase() === MTRSysContratAddr) {
    token = 'MTR';
  } else {
    return;
  }

  let sender = '0x' + evt.topics[1].slice(-40);
  let recipient = '0x' + evt.topics[1].slice(-40);

  if (evt.topics[1].toLowerCase() === acctAddressBytes32) {
    // send
    isSend = true;
    if (token === 'MTR') {
      mtrDelta = mtrDelta.minus(amount);
    } else {
      mtrgDelta = mtrgDelta.minus(amount);
    }
    const receipt = await pos.getReceipt(evt.meta.txID);
    paid = new BigNumber(receipt.paid);
  } else if (evt.topics[2].toLowerCase() === acctAddressBytes32) {
    // recv
    if (token === 'MTR') {
      mtrDelta = mtrDelta.plus(amount);
    } else {
      mtrgDelta = mtrgDelta.plus(amount);
    }
  }

  return {
    isSend,
    mtrDelta,
    mtrgDelta,
    amount,
    token,
    paid,
    blockNumber: evt.meta.blockNumber,
    sender,
    recipient,
    isSysContract: true,
  };
};

const handleTransfer = async (transfer: any) => {
  const token = transfer.token === 1 ? 'MTRG' : 'MTR';
  const amount = new BigNumber(transfer.amount);
  let paid = new BigNumber(0);
  let isSend = false;
  let mtrDelta = new BigNumber(0);
  let mtrgDelta = new BigNumber(0);
  if (transfer.sender.toLowerCase() === acctAddress.toLowerCase()) {
    isSend = true;
    if (token === 'MTR') {
      mtrDelta = mtrDelta.minus(amount);
    } else {
      mtrgDelta = mtrgDelta.minus(amount);
    }
    const receipt = await pos.getReceipt(transfer.meta.txID);
    paid = new BigNumber(receipt.paid);
  }
  if (transfer.recipient.toLowerCase() === acctAddress.toLowerCase()) {
    isSend = false;
    if (token === 'MTR') {
      mtrDelta = mtrDelta.plus(amount);
    } else {
      mtrgDelta = mtrgDelta.plus(amount);
    }
  }

  return {
    isSend,
    mtrDelta,
    mtrgDelta,
    token,
    amount,
    paid,
    blockNumber: transfer.meta.blockNumber,
    sender: transfer.sender.toLowerCase(),
    recipient: transfer.recipient.toLowerCase(),
    isSysContract: false,
  };
};

const processAccount = async () => {
  const genesisBalance = await net.http<any>('GET', `accounts/${acctAddress}?revision=0`);
  const chainAcc = await net.http<any>('GET', `accounts/${acctAddress}`);
  let mtr = new BigNumber(genesisBalance.energy);
  let mtrg = new BigNumber(genesisBalance.balance);
  console.log(`INIT Balance : { MTR: ${fromWei(mtr)}, MTRG: ${fromWei(mtrg)}}`);
  let balance = new Balance(acctAddress, mtr, mtrg);
  let chainBalance = new Balance(acctAddress, chainAcc.energy, chainAcc.balance);

  const res = await net.http<any>('POST', 'logs/transfer', {
    body: {
      criteriaSet: [{ sender: acctAddress }, { recipient: acctAddress }],
    },
  });
  const transfers = res.sort((a, b) => a.meta.blockNumber - b.meta.blockNumber);
  const evtRes = await net.http<any>('POST', 'logs/event', {
    body: {
      criteriaSet: [
        {
          topic0: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          topic1: acctAddressBytes32,
        },
        {
          topic0: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          topic2: acctAddressBytes32,
        },
      ],
    },
  });
  const events = evtRes.sort((a, b) => a.meta.blockNumber - b.meta.blockNumber);
  let trSend = 0,
    trRecv = 0,
    scSend = 0,
    scRecv = 0;

  let outputs = transfers.concat(events);
  outputs = outputs.sort((a, b) => a.meta.blockNumber - b.meta.blockNumber);
  for (const o of outputs) {
    let d;
    if ('topics' in o) {
      d = await handleEvent(o);
    } else {
      d = await handleTransfer(o);
    }
    console.log('----------------------------------------------------------------------');
    console.log(`Block ${d.blockNumber}`);
    console.log(
      `${d.isSysContract ? '[SysContract] ' : ''} ${d.isSend ? 'Sent' : 'Recv'} ${fromWei(d.amount)} ${d.token} ${
        d.isSend ? 'to' : 'from'
      } ${d.isSend ? d.recipient : d.sender}`
    );
    if (d.paid.isGreaterThan(0)) {
      console.log(`Fee: ${fromWei(d.paid)} MTR`);
    }
    balance.plusMTR(d.mtrDelta);
    balance.plusMTRG(d.mtrgDelta);
    balance.minusMTR(d.paid);
    console.log(`Balance after ${balance.String()}`);
    if (d.isSysContract) {
      d.isSend ? scSend++ : scRecv++;
    } else {
      d.isSend ? trSend++ : trRecv++;
    }
  }

  console.log('======================================================================');
  console.log(`Address: ${acctAddress}`);
  console.log(`Transfer    Sent: ${trSend}, Recv: ${trRecv}`);
  console.log(`SysContract Sent: ${scSend}, Recv: ${scRecv}`);
  const mtrMatch = balance.MTR().isEqualTo(chainBalance.MTR());
  const mtrgMatch = balance.MTRG().isEqualTo(chainBalance.MTRG());
  console.log(`Balance FINAL : ${balance.String()}`);
  console.log(`Balance CHAIN : ${chainBalance.String()}`);
  console.log(`MTR: ${mtrMatch ? 'match' : 'MISMATCH!!'}, MTRG: ${mtrgMatch ? 'match' : 'MISMATCH!!'}`);
};

(async () => {
  try {
    await processAccount();
  } catch (e) {
    console.log('error happened: ', e);
  }
})();
