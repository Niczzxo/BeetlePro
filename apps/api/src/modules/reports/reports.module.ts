import { Module } from '@nestjs/common';
import { CartRecoveryModule } from '../cart-recovery/cart-recovery.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports module: read-only aggregations over existing stores.
 * It owns no models and writes nothing.
 */
@Module({
  imports: [OrdersModule, PaymentsModule, CartRecoveryModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
