import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { CourierWebhooksController } from './courier-webhooks.controller';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ShippingRepository } from './repositories/shipping.repository';
import { InMemoryShippingRepository } from './repositories/in-memory-shipping.repository';
import {
  CourierHttpClient,
  FetchCourierHttpClient,
} from './providers/courier-http';
import { CourierProviderRegistry } from './providers/courier-provider.registry';
import { PathaoProvider } from './providers/pathao.provider';
import { SteadfastProvider } from './providers/steadfast.provider';
import { RedxProvider } from './providers/redx.provider';

/**
 * Shipping module (Phase 6, chunk 2): courier booking and
 * tracking with Pathao, Steadfast and RedX adapters behind the
 * injectable CourierHttpClient, staff endpoints behind the
 * shipping permissions, and the signed, idempotent courier
 * webhook receiver. See the module README for the honesty rules
 * and the environment variables each adapter reads.
 */
@Module({
  imports: [OrdersModule, PaymentsModule, AuditModule],
  controllers: [ShippingController, CourierWebhooksController],
  providers: [
    ShippingService,
    CourierProviderRegistry,
    PathaoProvider,
    SteadfastProvider,
    RedxProvider,
    { provide: CourierHttpClient, useClass: FetchCourierHttpClient },
    { provide: ShippingRepository, useClass: InMemoryShippingRepository },
  ],
  exports: [ShippingService, ShippingRepository],
})
export class ShippingModule {}
