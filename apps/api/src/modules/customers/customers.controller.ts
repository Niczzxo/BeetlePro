import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import {
  principalHasPermission,
  type AuthPrincipal,
} from '../../common/auth/principal';
import { CustomersService } from './customers.service';
import {
  customerRegistrationSchema,
  type CustomerRegistration,
} from './dto/register-customer.dto';

@Controller('v1/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const dto: CustomerRegistration = parseBody(
      customerRegistrationSchema,
      body,
    );
    return this.customers.register(dto);
  }

  /**
   * Staff customer list for the admin CRM page (Phase 4, chunk 2).
   * Guard: customers.read. Optional `search` (name, email or
   * phone) and `limit` query parameters. Declared before the :id
   * route so the list path is never read as a customer id.
   */
  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('customers.read')
  async list(@Query('search') search?: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return {
      items: await this.customers.listStaff({
        search: search || undefined,
        limit:
          parsedLimit && parsedLimit > 0 ? parsedLimit : undefined,
      }),
    };
  }

  /**
   * A customer profile. Requires a token: the customer themselves
   * (subject must match the id) or a staff token holding
   * customers.read. Before Phase 4 chunk 2 this read was
   * unguarded; profiles carry personal data, so it is guarded now.
   */
  @Get(':id')
  @UseGuards(AuthGuard)
  async getProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.type === 'customer') {
      if (user.id !== id) {
        throw new ForbiddenException(
          'Customers can only read their own profile',
        );
      }
    } else if (!principalHasPermission(user, 'customers.read')) {
      throw new ForbiddenException(
        'Missing required permission: customers.read',
      );
    }
    return this.customers.getProfile(id);
  }
}
