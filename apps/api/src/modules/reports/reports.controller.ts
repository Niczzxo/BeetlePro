import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import { ReportsService } from './reports.service';

/** Reports & Analytics: one aggregated summary read behind
 * reports.read. The window is optional; the default is the last
 * 30 days. */
@Controller('v1/admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('reports.read')
  async summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.summary({ from, to });
  }
}
