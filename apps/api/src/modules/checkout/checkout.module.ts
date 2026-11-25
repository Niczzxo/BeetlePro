import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CartsModule } from '../carts/carts.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { LeadsModule } from '../leads/leads.module';
import { CartRecoveryModule } from '../cart-recovery/cart-recovery.module';
import { CheckoutController } from './checkout.controller';
import { StaffOrdersController } from './staff-orders.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [
    AuditModule,
    CatalogModule,
    CartsModule,
    CustomersModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    VisitorsModule,
    LeadsModule,
    CartRecoveryModule,
  ],
  controllers: [CheckoutController, StaffOrdersController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
