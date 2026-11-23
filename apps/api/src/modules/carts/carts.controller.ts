import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { CartsService } from './carts.service';
import {
  cartCreateSchema,
  cartLineCreateSchema,
  cartLineUpdateSchema,
  type CartCreate,
  type CartLineCreate,
  type CartLineUpdate,
} from './dto/cart.dto';

@Controller('v1/carts')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Post()
  create(@Body() body: unknown) {
    const dto: CartCreate = parseBody(cartCreateSchema, body ?? {});
    return this.carts.createCart(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.carts.getCart(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() body: unknown) {
    const dto: CartLineCreate = parseBody(cartLineCreateSchema, body);
    return this.carts.addLine(id, dto);
  }

  @Patch(':id/lines/:lineId')
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    const dto: CartLineUpdate = parseBody(cartLineUpdateSchema, body);
    return this.carts.updateLine(id, lineId, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.carts.removeLine(id, lineId);
  }
}
