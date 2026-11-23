import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from './prisma.service';

/**
 * Runs a unit of work inside a database transaction when the
 * Prisma binding is active (docs/PRISMA_MIGRATION.md lists the
 * boundaries: order placement, order status transitions,
 * payment verify and refunds, webhook application). Services
 * depend on this abstraction only. The in-memory binding uses
 * NoopTransactionRunner: the store is single-threaded, so the
 * work is already atomic and the callback simply runs with no
 * transaction client.
 */
export abstract class TransactionRunner {
  abstract run<T>(fn: (tx?: Tx) => Promise<T>): Promise<T>;
}

@Injectable()
export class NoopTransactionRunner extends TransactionRunner {
  async run<T>(fn: (tx?: Tx) => Promise<T>): Promise<T> {
    return fn(undefined);
  }
}

@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(fn: (tx?: Tx) => Promise<T>): Promise<T> {
    return this.prisma.withTransaction((tx) => fn(tx));
  }
}
