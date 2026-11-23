import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { StoreModule } from './store/store.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { VisitorsModule } from './modules/visitors/visitors.module';
import { BuyerIntelligenceModule } from './modules/buyer-intelligence/buyer-intelligence.module';
import { LeadsModule } from './modules/leads/leads.module';
import { CrmModule } from './modules/crm/crm.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartsModule } from './modules/carts/carts.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { CartRecoveryModule } from './modules/cart-recovery/cart-recovery.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ...(process.env.DATABASE_URL ? [PrismaModule] : [StoreModule]),
    AuditModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    VisitorsModule,
    BuyerIntelligenceModule,
    LeadsModule,
    CrmModule,
    CatalogModule,
    CartsModule,
    JobsModule,
    CommunicationsModule,
    CartRecoveryModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    InventoryModule,
    ShippingModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
