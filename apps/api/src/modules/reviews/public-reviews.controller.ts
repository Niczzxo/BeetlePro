import { Controller, Get, Param } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

/**
 * Public review reads for the storefront: approved reviews only,
 * with the verified flag the server computed at entry. The
 * static Pages site does not call this; the Next.js storefront
 * does.
 */
@Controller('v1/catalog/products')
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':id/reviews')
  async list(@Param('id') id: string) {
    return this.reviews.listPublicWithSummary(id);
  }
}
