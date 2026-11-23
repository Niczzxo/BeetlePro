import {
  Body,
  Controller,
  Get,
  Param,
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
  legalDocumentUpdateSchema,
  type LegalDocumentUpdate,
} from './dto/legal.dto';
import { LegalService } from './legal.service';

/** Legal & Compliance: the editable legal documents, behind
 * settings.manage as in the sidebar registry. */
@Controller('v1/admin/legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async list() {
    return { items: await this.legal.list() };
  }

  @Get(':slug')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async get(@Param('slug') slug: string) {
    return this.legal.get(slug);
  }

  @Put(':slug')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('settings.manage')
  async update(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: LegalDocumentUpdate = parseBody(
      legalDocumentUpdateSchema,
      body,
    );
    return this.legal.update(slug, dto, user);
  }
}
