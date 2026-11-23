import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';

/** The transaction client handed down the four transactional
 * flows (docs/PRISMA_MIGRATION.md). Repository methods accept it
 * as an optional last parameter; the in-memory implementations
 * ignore it because the in-memory store is single-threaded and
 * already atomic. */
export type Tx = Prisma.TransactionClient;

/**
 * Thin wrapper around PrismaClient (docs/PRISMA_MIGRATION.md).
 * The client is created lazily on first use so importing this
 * module in the in-memory binding (or in tests that never touch
 * the database) never requires DATABASE_URL to be set. The
 * connection itself is established on module init when the
 * Prisma binding is active.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private instance: PrismaClient | null = null;

  get client(): PrismaClient {
    this.instance ??= new PrismaClient();
    return this.instance;
  }

  async connect(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
      this.instance = null;
    }
  }

  /** Runs fn inside one interactive transaction. Repository
   * calls made with the handed-down tx client join it; calls
   * without one use the root client. */
  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.client.$transaction((tx) => fn(tx));
  }
}
