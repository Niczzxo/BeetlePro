import { Body, Controller, Post } from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import {
  acceptInviteSchema,
  type AcceptInvite,
} from './dto/staff.dto';
import { StaffService } from './staff.service';

/**
 * Public invitation acceptance. The one-time token is the
 * credential: it is verified by hash, expiry and single use in
 * the service. No session exists yet for the invitee.
 */
@Controller('v1/auth/admin')
export class PublicStaffController {
  constructor(private readonly staff: StaffService) {}

  @Post('accept-invite')
  async acceptInvite(@Body() body: unknown) {
    const dto: AcceptInvite = parseBody(acceptInviteSchema, body);
    return this.staff.acceptInvite(dto);
  }
}
