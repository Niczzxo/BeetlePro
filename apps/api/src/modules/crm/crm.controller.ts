import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { CrmService } from './crm.service';
import {
  customerNoteCreateSchema,
  customerTagSchema,
  type CustomerNoteCreate,
  type CustomerTagInput,
} from './dto/crm.dto';

/**
 * Staff CRM endpoints (Phase 5), under the /v1/crm namespace from
 * docs/BACKEND_AND_DATABASE.md. Guards: customers.read for the
 * timeline, customers.edit for notes and tags. The timeline only
 * ever aggregates data linked to the customer through an
 * authenticated or consented flow.
 */
@Controller('v1/crm/customers')
@UseGuards(AuthGuard, PermissionsGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get(':id/timeline')
  @RequirePermission('customers.read')
  async timeline(@Param('id') id: string) {
    return this.crm.getTimeline(id);
  }

  @Post(':id/notes')
  @RequirePermission('customers.edit')
  async addNote(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: CustomerNoteCreate = parseBody(
      customerNoteCreateSchema,
      body,
    );
    return this.crm.addNote(id, dto.body, user);
  }

  @Post(':id/tags')
  @RequirePermission('customers.edit')
  async addTag(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const dto: CustomerTagInput = parseBody(customerTagSchema, body);
    return { tags: await this.crm.addTag(id, dto.tag, user) };
  }

  @Delete(':id/tags/:tag')
  @RequirePermission('customers.edit')
  async removeTag(
    @Param('id') id: string,
    @Param('tag') tag: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return { tags: await this.crm.removeTag(id, decodeURIComponent(tag), user) };
  }
}
