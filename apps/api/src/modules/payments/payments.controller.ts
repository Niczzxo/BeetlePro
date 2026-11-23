import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  PAYMENT_GATEWAYS,
  type PaymentGateway,
  type PaymentStatus,
} from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  manualPaymentConfirmSchema,
  paymentInitiateSchema,
  paymentVerifySchema,
  refundConfirmSchema,
  refundRequestSchema,
  type ManualPaymentConfirm,
  type PaymentInitiate,
  type PaymentVerify,
  type RefundConfirm,
  type RefundRequest,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

const PAYMENT_STATUSES: PaymentStatus[] = [
  'initiated',
  'awaiting-customer',
  'verification-pending',
  'pending',
  'pending-collection',
  'successful',
  'collected',
  'failed',
  'cancelled',
  'refunded',
];

/**
 * Payments API.
 *
 * Customer-shaped routes: initiate, and the manual mobile
 * banking confirm step. Staff-shaped routes (verify, refunds)
 * are guarded by Phase 4 RBAC: payments.verify for verification,
 * payments.refund for refunds. Gateway initiation with no
 * merchant credentials configured answers 503 (gateway not
 * configured); nothing is ever marked paid without a real
 * verification path.
 */
@Controller('v1/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Reconciliation list for the admin Payments page. Filters:
   * gateway, status, orderId. Staff only since Phase 4 chunk 2:
   * the payments.read permission. */
  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.read')
  async list(
    @Query('gateway') gateway?: string,
    @Query('status') status?: string,
    @Query('orderId') orderId?: string,
  ) {
    return {
      items: await this.payments.listPayments({
        gateway: PAYMENT_GATEWAYS.includes(gateway as PaymentGateway)
          ? (gateway as PaymentGateway)
          : undefined,
        status: PAYMENT_STATUSES.includes(status as PaymentStatus)
          ? (status as PaymentStatus)
          : undefined,
        orderId: orderId || undefined,
      }),
    };
  }

  /** Counts and totals by gateway and status. Declared before
   * the :paymentId route so "summary" is not read as an id.
   * Staff only: payments.read. */
  @Get('summary')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.read')
  async summary() {
    return this.payments.summary();
  }

  /** Payment detail with its event trail and refunds. Staff
   * only: payments.read. */
  @Get(':paymentId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.read')
  async get(@Param('paymentId') paymentId: string) {
    return this.payments.getPayment(paymentId);
  }

  /** Starts an attempt for an order and, for gateway channels,
   * creates the hosted session. Returns the payment and, for
   * gateways, the redirect URL for the customer. */
  @Post('initiate')
  async initiate(@Body() body: unknown) {
    const dto: PaymentInitiate = parseBody(paymentInitiateSchema, body);
    return this.payments.initiatePayment(dto);
  }

  /** Manual mobile banking: the customer reports the number they
   * sent money from and the transaction id. Moves the payment to
   * verification-pending; it is not paid until staff verify. */
  @Post(':paymentId/confirm')
  async confirmManual(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    const dto: ManualPaymentConfirm = parseBody(
      manualPaymentConfirmSchema,
      body,
    );
    return this.payments.confirmManualPayment(paymentId, dto);
  }

  /** Staff only: verify or reject a manual payment awaiting
   * verification. Guard: payments.verify. */
  @Post(':paymentId/verify')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.verify')
  async verifyManual(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: PaymentVerify = parseBody(paymentVerifySchema, body);
    return this.payments.verifyManualPayment(paymentId, dto, user);
  }

  /** Staff only: record a refund against a paid payment and
   * run the channel step. Guard: payments.refund. */
  @Post(':paymentId/refunds')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.refund')
  async requestRefund(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: RefundRequest = parseBody(refundRequestSchema, body);
    return this.payments.requestRefund(paymentId, dto, user);
  }

  /** Staff only: confirm a manual refund has been handed back.
   * Guard: payments.refund. */
  @Post(':paymentId/refunds/:refundId/confirm')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('payments.refund')
  async confirmRefund(
    @Param('paymentId') paymentId: string,
    @Param('refundId') refundId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: RefundConfirm = parseBody(refundConfirmSchema, body ?? {});
    return this.payments.confirmRefund(paymentId, refundId, dto, user);
  }
}
