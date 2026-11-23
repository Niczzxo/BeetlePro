import { Injectable } from '@nestjs/common';
import type { Courier } from '@dostelo/types';
import type { CourierProvider } from './courier-provider';
import { PathaoProvider } from './pathao.provider';
import { RedxProvider } from './redx.provider';
import { SteadfastProvider } from './steadfast.provider';

/**
 * Routes a courier key to its adapter, mirroring the payment
 * provider registry. All three couriers have real adapters;
 * whether one can run depends on its merchant credentials being
 * configured, which each adapter reports itself.
 */
@Injectable()
export class CourierProviderRegistry {
  constructor(
    private readonly pathao: PathaoProvider,
    private readonly steadfast: SteadfastProvider,
    private readonly redx: RedxProvider,
  ) {}

  forCourier(courier: Courier): CourierProvider {
    switch (courier) {
      case 'pathao':
        return this.pathao;
      case 'steadfast':
        return this.steadfast;
      case 'redx':
        return this.redx;
    }
  }

  all(): CourierProvider[] {
    return [this.pathao, this.steadfast, this.redx];
  }
}
