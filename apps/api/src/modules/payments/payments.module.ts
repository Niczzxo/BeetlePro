import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './repositories/payments.repository';
import { InMemoryPaymentsRepository } from './repositories/in-memory-payments.repository';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { CodPaymentProvider } from './providers/cod.provider';
import { ManualMobileBankingProvider } from './providers/manual-mobile-banking.provider';
import { SslcommerzProvider } from './providers/sslcommerz.provider';
import { BkashGatewayProvider } from './providers/bkash-gateway.provider';

/**
 * Payments module (Phase 3, chunk 2): attempts, COD collection
 * sync, manual mobile banking with staff verification, hosted
 * gateway sessions (SSLCommerz, bKash tokenized) behind real
 * credential configuration, refunds and reconciliation reads.
 * See the module README for the gateway honesty rules and the
 * environment variables each adapter reads.
 */
@Module({
  imports: [OrdersModule, AuditModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    CodPaymentProvider,
    ManualMobileBankingProvider,
    SslcommerzProvider,
    BkashGatewayProvider,
    { provide: PaymentsRepository, useClass: InMemoryPaymentsRepository },
  ],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
