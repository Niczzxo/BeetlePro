import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ReviewStatus } from '@dostelo/types';
import { parseBody } from '../../common/parse-body';
import {
  CurrentUser,
  RequirePermission,
} from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createReviewSchema,
  reviewReplySchema,
  reviewRequestSchema,
  reviewStatusSchema,
  type CreateReview,
  type ReviewReplyCreate,
  type ReviewRequestCreate,
  type ReviewStatusUpdate,
} from './dto/reviews.dto';
import { ReviewsService } from './reviews.service';

/**
 * Reviews & Reputation endpoints. The module's permissions are
 * the marketing pair: marketing.read to view, marketing.edit to
 * enter and moderate.
 */
@Controller('v1/admin/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.read')
  async list(
    @Query('productId') productId?: string,
    @Query('status') status?: ReviewStatus,
  ) {
    return { items: await this.reviews.list({ productId, status }) };
  }

  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: CreateReview = parseBody(createReviewSchema, body);
    return this.reviews.create(dto, user);
  }

  @Post(':id/status')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: ReviewStatusUpdate = parseBody(reviewStatusSchema, body);
    return this.reviews.setStatus(id, dto.status, user, dto.reason);
  }

  @Post('requests')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async request(
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: ReviewRequestCreate = parseBody(reviewRequestSchema, body);
    return this.reviews.requestReview(dto, user);
  }

  @Post(':id/replies')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async addReply(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    const dto: ReviewReplyCreate = parseBody(reviewReplySchema, body);
    return this.reviews.addReply(id, dto.body, user);
  }

  @Delete(':id/replies/:replyId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermission('marketing.edit')
  async deleteReply(
    @Param('id') id: string,
    @Param('replyId') replyId: string,
    @CurrentUser() user: AuthPrincipal | null,
  ) {
    return this.reviews.deleteReply(id, replyId, user);
  }
}
