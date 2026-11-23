import { Module } from '@nestjs/common';
import { RateLimitGuard, RateLimiter } from '../../common/rate-limit';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CartsModule } from '../carts/carts.module';
import { CommunicationsModule } from '../communications/communications.module';
import { CustomersModule } from '../customers/customers.module';
import { JobsModule } from '../jobs/jobs.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { CartRecoveryController } from './cart-recovery.controller';
import { CartRecoveryService } from './cart-recovery.service';
import { RecoveryController } from './recovery.controller';
import { CartRecoveryRepository } from './repositories/cart-recovery.repository';
import { InMemoryCartRecoveryRepository } from './repositories/in-memory-cart-recovery.repository';
import { PrismaCartRecoveryRepository } from './repositories/prisma-cart-recovery.repository';

/**
 * Cart recovery module (Phase 6): detection, the step sequence
 * over the JobQueue seam, recovery marking from checkout, staff
 * endpoints and the public recovery token read.
 */
@Module({
  imports: [
    CartsModule,
    CatalogModule,
    CustomersModule,
    VisitorsModule,
    CommunicationsModule,
    JobsModule,
    AuditModule,
  ],
  controllers: [CartRecoveryController, RecoveryController],
  providers: [
    CartRecoveryService,
    RateLimiter,
    RateLimitGuard,
    {
      provide: CartRecoveryRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaCartRecoveryRepository
        : InMemoryCartRecoveryRepository,
    },
  ],
  exports: [CartRecoveryService, CartRecoveryRepository],
})
export class CartRecoveryModule {}
