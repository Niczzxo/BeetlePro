import {
  DEFAULT_DELIVERY_FEES,
  DEFAULT_LOYALTY_RULES,
  DEFAULT_POINTS_RULES,
  DEFAULT_SLA_TARGETS,
  DEFAULT_STORE_PROFILE,
  type DeliveryFeeSettings,
  type LoyaltyRules,
  type PointsRule,
  type SlaTargets,
} from '@dostelo/types';
import type { Tx } from '../prisma/prisma.service';

export type ManualInstructions = Record<
  'bkash' | 'nagad' | 'rocket' | 'upay',
  string
>;

/** The store settings record: the free delivery offer switch and
 * the manual mobile-banking receiving instructions from the
 * legacy site's localStorage, plus (Website Management build)
 * the store profile, the delivery fee table checkout charges,
 * and the loyalty rules. One record, one seam. */
export interface StoreSettingsData {
  freeDeliveryOffer: boolean;
  manualInstructions: ManualInstructions;
  storeName: string;
  contactEmail: string;
  contactPhone: string;
  deliveryFees: DeliveryFeeSettings;
  loyaltyRules: LoyaltyRules;
  /** Days after delivery during which a return can be opened. */
  returnWindowDays: number;
  /** Enable flag for the lead candidate evaluation automation. */
  automationLeadEvaluationEnabled: boolean;
  /** Whether Cash on Delivery is accepted at checkout. */
  allowCod: boolean;
  /** Whether the store is live for catalogue and checkout. */
  storeLive: boolean;
  /** Support SLA targets by priority, in hours. */
  slaTargets: SlaTargets;
  /** Loyalty points rules (seeded defaults ship inactive). */
  loyaltyPointRules: PointsRule[];
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
  storeName: DEFAULT_STORE_PROFILE.storeName,
  contactEmail: DEFAULT_STORE_PROFILE.contactEmail,
  contactPhone: DEFAULT_STORE_PROFILE.contactPhone,
  deliveryFees: DEFAULT_DELIVERY_FEES,
  loyaltyRules: DEFAULT_LOYALTY_RULES,
  returnWindowDays: 30,
  automationLeadEvaluationEnabled: true,
  allowCod: true,
  storeLive: true,
  slaTargets: structuredClone(DEFAULT_SLA_TARGETS),
  loyaltyPointRules: DEFAULT_POINTS_RULES.map((rule) => ({ ...rule })),
};

/**
 * Store settings persistence seam (docs/PRISMA_MIGRATION.md,
 * schema gap 2). Readers: CheckoutService (the free delivery
 * offer switch and, since the Website Management build, the
 * delivery fee table), the manual mobile-banking provider (the
 * receiving instructions), the Website Management endpoints
 * (the whole record) and the Loyalty module (the rules).
 */
export abstract class SettingsRepository {
  abstract get(tx?: Tx): Promise<StoreSettingsData>;
  abstract save(settings: StoreSettingsData, tx?: Tx): Promise<void>;
}
