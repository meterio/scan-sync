import { EntityManager, getConnection } from 'typeorm';
export abstract class Processor {
  public async start() {
    return;
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
