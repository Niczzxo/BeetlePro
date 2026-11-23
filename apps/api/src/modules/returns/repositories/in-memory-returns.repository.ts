import { Injectable } from '@nestjs/common';
import type { ReturnRequest } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  ReturnsRepository,
  type ReturnFilter,
} from './returns.repository';

@Injectable()
export class InMemoryReturnsRepository extends ReturnsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(request: ReturnRequest): Promise<ReturnRequest> {
    this.db.returnRequests.set(request.id, request);
    return request;
  }

  async save(request: ReturnRequest): Promise<void> {
    this.db.returnRequests.set(request.id, request);
  }

  async findById(id: string): Promise<ReturnRequest | null> {
    return this.db.returnRequests.get(id) ?? null;
  }

  async list(filter?: ReturnFilter): Promise<ReturnRequest[]> {
    return [...this.db.returnRequests.values()]
      .filter(
        (request) =>
          (!filter?.status || request.status === filter.status) &&
          (!filter?.orderNumber ||
            request.orderNumber === filter.orderNumber),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
