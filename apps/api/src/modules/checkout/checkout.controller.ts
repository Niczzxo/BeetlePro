import { Body, Controller, Post } from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { CheckoutService } from './checkout.service';
import {
  checkoutRequestSchema,
  type CheckoutRequest,
} from './dto/checkout.dto';

@Controller('v1/checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /** Server-side totals for the given lines, address and payment
   * method. Nothing is persisted. */
  @Post('quote')
  async quote(@Body() body: unknown) {
    const dto: CheckoutRequest = parseBody(checkoutRequestSchema, body);
    return this.checkout.quote(dto);
  }

  /** Places the order: validates stock, reserves it, records the
   * order against the customer and returns it in pending status. */
  @Post('place-order')
  async placeOrder(@Body() body: unknown) {
    const dto: CheckoutRequest = parseBody(checkoutRequestSchema, body);
    return this.checkout.placeOrder(dto);
  }
}
