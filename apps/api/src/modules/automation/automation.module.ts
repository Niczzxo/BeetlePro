import { Module } from '@nestjs/common';
import { CartRecoveryModule } from '../cart-recovery/cart-recovery.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

/**
 * Automation module: a read-only inventory over the subsystems
 * that actually automate work in the platform. It owns no data
 * and starts no jobs of its own.
 */
@Module({
  imports: [CartRecoveryModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
