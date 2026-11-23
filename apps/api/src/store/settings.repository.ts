import type { Tx } from '../prisma/prisma.service';

export type ManualInstructions = Record<
  'bkash' | 'nagad' | 'rocket' | 'upay',
  string
>;

/** The store settings the legacy site keeps in localStorage:
 * the free delivery offer switch (mirrors the admin toggle on
 * the legacy Account page, default off) and the receiving
 * instructions for manual mobile banking. */
export interface StoreSettingsData {
  freeDeliveryOffer: boolean;
  manualInstructions: ManualInstructions;
}

/**
 * Placeholder receiving instructions, one per manual method.
 * These are store-configured texts: the store replaces the
 * placeholder with its real receiving number and wording (in
 * the database-backed settings). The placeholder mirrors the
 * live storefront, which shares the number by SMS with the
 * order confirmation; no real number is stored in code.
 */
export const DEFAULT_MANUAL_INSTRUCTIONS: ManualInstructions = {
  bkash:
    'Store-configured placeholder: send money to the Dostelo bKash number shared by SMS with your order confirmation. Use the reference below (your order number).',
  nagad:
    'Store-configured placeholder: send money to the Dostelo Nagad number shared by SMS with your order confirmation. Use the reference below (your order number).',
  rocket:
    'Store-configured placeholder: send money to the Dostelo Rocket number shared by SMS with your order confirmation. Use the reference below (your order number).',
  upay:
    'Store-configured placeholder: send money to the Dostelo Upay number shared by SMS with your order confirmation. Use the reference below (your order number).',
};

export const DEFAULT_STORE_SETTINGS: StoreSettingsData = {
  freeDeliveryOffer: false,
  manualInstructions: DEFAULT_MANUAL_INSTRUCTIONS,
};

/**
 * Store settings persistence seam (docs/PRISMA_MIGRATION.md,
 * schema gap 2). The only readers are CheckoutService (the free
 * delivery offer switch) and the manual mobile-banking provider
 * (the receiving instructions); both were rewired from reading
 * the in-memory store directly to this interface as part of the
 * Prisma swap.
 */
export abstract class SettingsRepository {
  abstract get(tx?: Tx): Promise<StoreSettingsData>;
  abstract save(settings: StoreSettingsData, tx?: Tx): Promise<void>;
}
