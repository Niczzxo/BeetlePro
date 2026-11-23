import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service';

/**
 * Gateway webhook receiver: POST /v1/webhooks/:gateway.
 *
 * Gateways with an adapter: sslcommerz, bkash. Everything else,
 * including cod and the manual methods (which have no webhooks),
 * is a 404. Signature verification, secret configuration checks
 * and idempotency all live in WebhooksService; this controller
 * only hands over the payload, the signature header and the raw
 * body (needed for HMAC verification).
 */
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post(':gateway')
  handle(
    @Param('gateway') gateway: string,
    @Body() body: unknown,
    @Headers('x-bkash-signature') bkashSignature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const payload = (body ?? {}) as Record<string, unknown>;
    const rawBody = req.rawBody?.toString('utf8');
    return this.webhooks.handle(gateway, payload, bkashSignature, rawBody);
  }
}
