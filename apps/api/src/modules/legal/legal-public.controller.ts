import {
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { LegalService } from './legal.service';

/**
 * Public legal documents: the published copies only, served by
 * slug for any storefront surface that reads the API. Drafts are
 * never visible here; an unpublished or unknown slug is a 404.
 */
@Controller('v1/legal')
export class LegalPublicController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  async list() {
    return { items: await this.legal.listPublic() };
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const doc = await this.legal.getPublic(slug);
    if (!doc) {
      throw new NotFoundException(
        `No published legal document: ${slug}`,
      );
    }
    return doc;
  }
}
