import { Block } from '../../powergrid-db/entity/block';
import { Account } from '../../powergrid-db/entity/account';
import { Meter } from '../../meter-rest';
import { AssetMovement } from '../../powergrid-db/entity/movement';
import { displayID } from '../../utils';
import { EntityManager } from 'typeorm';

export class BlockProcessor {
  public Movement: AssetMovement[] = [];

  private acc = new Map<string, Account>();
  private updateCode = new Set<string>();
  private updateMTR = new Set<string>();
  private updateMTRG = new Set<string>();

  constructor(
    readonly block: Block,
    readonly meter: Meter,
    readonly manager: EntityManager
  ) {}

  public async transferMTRG(move: AssetMovement) {
    const senderAcc = await this.account(move.sender);
    const recipientAcc = await this.account(move.recipient);

    if (move.sender === '0x000000000000000000000000000000000000') {
      // touch sender's balance
      let balance = BigInt(senderAcc.mtrg) - BigInt(move.amount);
      if (balance < 0) {
        throw new Error(
          `Fatal: MTRG balance under 0 of Account(${
            move.sender
          }) at Block(${displayID(this.block.id)})`
        );
      }
      senderAcc.mtrg = balance;
    }

    // touch recipient's account
    let balance = BigInt(recipientAcc.mtrg) + BigInt(move.amount);
    recipientAcc.mtrg = balance;

    this.Movement.push(move);

    await this.touchMTRG(move.sender);
    await this.touchMTRG(move.recipient);
  }

  public async transferMTR(move: AssetMovement) {
    await this.account(move.sender);
    await this.account(move.recipient);

    this.Movement.push(move);

    await this.touchMTR(move.sender);
    await this.touchMTR(move.recipient);
  }

  public accounts() {
    const accs: Account[] = [];
    for (const [_, acc] of this.acc.entries()) {
      accs.push(acc);
    }
    return accs;
  }

  public async finalize() {
    for (const [_, acc] of this.acc.entries()) {
      if (this.updateMTR.has(acc.address)) {
        const ret = await this.meter.getAccount(acc.address, this.block.id);
        acc.mtrg = BigInt(ret.balance);
        acc.mtr = BigInt(ret.energy);
        acc.blockTime = this.block.timestamp;

        /*
        if (
          acc.code !== null &&
          ret.hasCode === false &&
          acc.energy === BigInt(0) &&
          acc.balance === BigInt(0)
        ) {
          const master = await this.getMaster(acc.address);
          // contract suicide
          if (master === null) {
            acc.code = null;
          }
        }
        */
      }
      if (this.updateCode.has(acc.address)) {
        const code = await this.meter.getCode(acc.address, this.block.id);
        if (code && code.code !== '0x') {
          acc.code = code.code;
        }
      }
    }
  }

  public async touchMTRG(addr: string) {
    await this.account(addr);
    if (this.updateMTRG.has(addr)) {
      return;
    }
    this.meter.getAccount(addr, this.block.id).catch();
    this.updateMTRG.add(addr);
    return;
  }

  public async touchMTR(addr: string) {
    await this.account(addr);
    if (this.updateMTR.has(addr)) {
      return;
    }
    this.meter.getAccount(addr, this.block.id).catch();
    this.updateMTR.add(addr);
    return;
  }

  public async genesisAccount(addr: string) {
    if (this.block.number !== 0) {
      throw new Error(
        'calling genesisAccount is forbid in block #' + this.block.number
      );
    }
    const acc = await this.account(addr);
    const chainAcc = await this.meter.getAccount(acc.address, this.block.id);

    acc.mtrg = BigInt(chainAcc.balance);
    acc.mtr = BigInt(chainAcc.energy);
    acc.blockTime = this.block.timestamp;

    if (chainAcc.hasCode) {
      const chainCode = await this.meter.getCode(acc.address, this.block.id);
      acc.code = chainCode.code;
    }
  }

  private async account(addr: string) {
    if (this.acc.has(addr)) {
      return this.acc.get(addr)!;
    }

    const acc = await this.manager
      .getRepository(Account)
      .findOne({ address: addr });
    if (acc) {
      this.acc.set(addr, acc);
      return acc;
    } else {
      // console.log(`Create Account(${addr}) at Block(${displayID(this.block.id)})`)
      const newAcc = this.manager.create(Account, {
        address: addr,
        mtrg: BigInt(0),
        mtr: BigInt(0),
        blockTime: this.block.timestamp,
        firstSeen: this.block.timestamp,
        code: null,
      });

      this.acc.set(addr, newAcc);
      return newAcc;
    }
  }

  /** VIP181 Transaction Fee Delegation
  private async getMaster(addr: string) {
    const ret = await this.meter.explain(
      {
        clauses: [
          {
            to: PrototypeAddress,
            value: '0x0',
            data: prototype.master.encode(addr),
          },
        ],
      },
      this.block.id
    );
    const decoded = prototype.master.decode(ret[0].data);
    if (decoded['0'] === ZeroAddress) {
      return null;
    } else {
      return decoded['0'];
    }
  }
   */
}
