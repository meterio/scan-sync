import { Block } from '../../powergrid-db/entity/block';
import { Account } from '../../powergrid-db/entity/account';
import { Meter } from '../../meter-rest';
import { AssetMovement } from '../../powergrid-db/entity/movement';
import { displayID } from '../../utils';
import { EntityManager } from 'typeorm';
import { Snapshot } from '../../powergrid-db/entity/snapshot';
import { SnapType } from '../../powergrid-db/types';

export class BlockProcessor {
  public Movement: AssetMovement[] = [];

  private acc = new Map<string, Account>();
  private updateCode = new Set<string>();
  private updateMTR = new Set<string>();

  constructor(
    readonly block: Block,
    readonly meter: Meter,
    readonly manager: EntityManager
  ) {}

  /** VIP191 Transaction Fee Delegation
  public async prepare() {
    const forkConfig = getForkConfig(this.meter.genesisID);
    if (this.block.number === forkConfig.VIP191) {
      await this.account(ExtensionAddress);
      this.updateCode.add(ExtensionAddress);
    }
  }

  public async master(addr: string, master: string) {
    const acc = await this.account(addr);

    acc.master = master;
    this.updateCode.add(addr);
    return acc;
  }

  public async sponsorSelected(addr: string, sponsor: string) {
    const acc = await this.account(addr);

    acc.sponsor = sponsor;
    return acc;
  }

  public async sponsorUnSponsored(addr: string, sponsor: string) {
    const acc = await this.account(addr);

    if (acc.sponsor === sponsor) {
      acc.sponsor = null;
    }
    return acc;
  }
  */

  public async transferMTRG(move: AssetMovement) {
    const senderAcc = await this.account(move.sender);
    const recipientAcc = await this.account(move.recipient);

    // touch sender's balance
    let balance = BigInt(senderAcc.balance) - BigInt(move.amount);
    if (balance < 0) {
      throw new Error(
        `Fatal: MTRG balance under 0 of Account(${
          move.sender
        }) at Block(${displayID(this.block.id)})`
      );
    }
    senderAcc.balance = balance;

    // touch recipient's account
    balance = BigInt(recipientAcc.balance) + BigInt(move.amount);
    recipientAcc.balance = balance;

    this.Movement.push(move);

    await this.touchMTR(move.sender);
    await this.touchMTR(move.recipient);
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
        acc.energy = BigInt(ret.energy);
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

  public snapshot(): Snapshot {
    const snap = new Snapshot();
    snap.blockID = this.block.id;
    snap.type = SnapType.DualToken;

    if (!this.snap.size) {
      snap.data = null;
    } else {
      const data: object[] = [];
      for (const [_, acc] of this.snap.entries()) {
        data.push(acc);
      }
      snap.data = data;
    }

    return snap;
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

    acc.balance = BigInt(chainAcc.balance);
    acc.energy = BigInt(chainAcc.energy);
    acc.blockTime = this.block.timestamp;

    if (chainAcc.hasCode) {
      const chainCode = await this.meter.getCode(acc.address, this.block.id);
      acc.code = chainCode.code;
    }
  }

  private takeSnap(acc: Account) {
    this.snap.set(acc.address, {
      address: acc.address,
      balance: acc.balance.toString(10),
      energy: acc.energy.toString(10),
      blockTime: acc.blockTime,
      firstSeen: acc.firstSeen,
      code: acc.code,
    });
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
      this.takeSnap(acc);
      return acc;
    } else {
      // console.log(`Create Account(${addr}) at Block(${displayID(this.block.id)})`)
      const newAcc = this.manager.create(Account, {
        address: addr,
        balance: BigInt(0),
        energy: BigInt(0),
        blockTime: this.block.timestamp,
        firstSeen: this.block.timestamp,
        code: null,
      });

      this.acc.set(addr, newAcc);
      this.takeSnap(newAcc);
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
