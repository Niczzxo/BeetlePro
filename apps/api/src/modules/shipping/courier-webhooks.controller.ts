import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ShippingService } from './shipping.service';

/**
 * Courier webhook receiver: POST /v1/webhooks/couriers/:courier.
 *
 * Couriers with an adapter: pathao, steadfast, redx. Signature
 * verification (HMAC-SHA256 of the raw body with the courier's
 * configured webhook secret, sent in the x-courier-signature
 * header), the secret configuration check and idempotency all
 * live in ShippingService.handleCourierWebhook; this controller
 * only hands over the payload, the signature header and the raw
 * body the HMAC needs.
 */
@Controller('v1/webhooks/couriers')
export class CourierWebhooksController {
  constructor(private readonly shipping: ShippingService) {}

  @Post(':courier')
  handle(
    @Param('courier') courier: string,
    @Body() body: unknown,
    @Headers('x-courier-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const payload = (body ?? {}) as Record<string, unknown>;
    const rawBody = req.rawBody?.toString('utf8');
    return this.shipping.handleCourierWebhook(
      courier,
      payload,
      signature,
      rawBody,
    );
  }
}
