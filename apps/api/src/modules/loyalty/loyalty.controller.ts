import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  loyaltyAdjustSchema,
  loyaltyRulesSchema,
  pointsRuleSchema,
  type LoyaltyAdjust,
  type LoyaltyRulesUpdate,
  type PointsRuleUpsert,
} from './dto/loyalty.dto';
import { LoyaltyService } from './loyalty.service';

/** Loyalty endpoints: marketing.read to view balances and rules,
 * marketing.edit to adjust points and change the rules. */
@Controller('v1/admin/loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('rules')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async rules() {
    return this.loyalty.getRules();
  }

  @Put('rules')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async updateRules(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: LoyaltyRulesUpdate = parseBody(loyaltyRulesSchema, body);
    return this.loyalty.updateRules(dto, user);
  }

  @Get('point-rules')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async pointRules() {
    return { items: await this.loyalty.listPointRules() };
  }

  @Post('point-rules')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async upsertPointRule(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: PointsRuleUpsert = parseBody(pointsRuleSchema, body);
    return { items: await this.loyalty.upsertPointRule(dto, user) };
  }

  @Get('transactions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async allTransactions() {
    return { items: await this.loyalty.listAllTransactions() };
  }

  @Get('customers')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async listBalances() {
    return { items: await this.loyalty.listBalances() };
  }

  @Get('customers/:customerId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async balance(@Param('customerId') customerId: string) {
    return this.loyalty.balanceFor(customerId);
  }

  @Get('customers/:customerId/transactions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async transactions(@Param('customerId') customerId: string) {
    return {
      items: await this.loyalty.listTransactions(customerId),
    };
  }

  @Post('customers/:customerId/adjust')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async adjust(
    @Param('customerId') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: LoyaltyAdjust = parseBody(loyaltyAdjustSchema, body);
    return this.loyalty.adjust(customerId, dto, user);
  }
}
