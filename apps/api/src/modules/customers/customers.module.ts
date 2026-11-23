import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomersRepository } from './repositories/customers.repository';
import { InMemoryCustomersRepository } from './repositories/in-memory-customers.repository';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    { provide: CustomersRepository, useClass: InMemoryCustomersRepository },
  ],
  exports: [CustomersService, CustomersRepository],
})
export class CustomersModule {}
