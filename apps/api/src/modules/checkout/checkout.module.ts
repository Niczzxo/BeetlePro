import { Module } from '@nestjs/common';
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
import { CheckoutService } from './checkout.service';

@Module({
  imports: [
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
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
