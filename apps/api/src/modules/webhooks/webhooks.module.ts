import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Webhooks module (Phase 3, chunk 2): signed, idempotent gateway
 * callbacks for sslcommerz and bkash. See WebhooksService for the
 * trust rules.
 */
@Module({
  imports: [PaymentsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
