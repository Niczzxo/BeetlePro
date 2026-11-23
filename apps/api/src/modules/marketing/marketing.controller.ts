import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CampaignStatus } from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createCampaignSchema,
  updateCampaignSchema,
  type CreateCampaign,
  type UpdateCampaign,
} from './dto/marketing.dto';
import { MarketingService } from './marketing.service';

/** Marketing endpoints: marketing.read to view, marketing.edit
 * to create and change campaigns. */
@Controller('v1/admin/campaigns')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async list(@Query('status') status?: CampaignStatus) {
    return { items: await this.marketing.list({ status }) };
  }

  @Get(':id')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async get(@Param('id') id: string) {
    return this.marketing.getById(id);
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: CreateCampaign = parseBody(createCampaignSchema, body);
    return this.marketing.create(dto, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: UpdateCampaign = parseBody(updateCampaignSchema, body);
    return this.marketing.update(id, dto, user);
  }
}
