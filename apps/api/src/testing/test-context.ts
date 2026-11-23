import { CatalogService } from '../modules/catalog/catalog.service';
import { InMemoryCatalogRepository } from '../modules/catalog/repositories/in-memory-catalog.repository';
import { CartsService } from '../modules/carts/carts.service';
import { InMemoryCartsRepository } from '../modules/carts/repositories/in-memory-carts.repository';
import { CheckoutService } from '../modules/checkout/checkout.service';
import { CustomersService } from '../modules/customers/customers.service';
import { InMemoryCustomersRepository } from '../modules/customers/repositories/in-memory-customers.repository';
import { InventoryService } from '../modules/inventory/inventory.service';
import { InMemoryInventoryRepository } from '../modules/inventory/repositories/in-memory-inventory.repository';
import { OrdersService } from '../modules/orders/orders.service';
import { InMemoryOrdersRepository } from '../modules/orders/repositories/in-memory-orders.repository';
import { PaymentsService } from '../modules/payments/payments.service';
import { InMemoryPaymentsRepository } from '../modules/payments/repositories/in-memory-payments.repository';
import { PaymentProviderRegistry } from '../modules/payments/providers/payment-provider.registry';
import { CodPaymentProvider } from '../modules/payments/providers/cod.provider';
import { ManualMobileBankingProvider } from '../modules/payments/providers/manual-mobile-banking.provider';
import { SslcommerzProvider } from '../modules/payments/providers/sslcommerz.provider';
import { BkashGatewayProvider } from '../modules/payments/providers/bkash-gateway.provider';
import { WebhooksService } from '../modules/webhooks/webhooks.service';
import { AuditService } from '../modules/audit/audit.service';
import { InMemoryAuditRepository } from '../modules/audit/repositories/in-memory-audit.repository';
import { AuthService } from '../modules/auth/auth.service';
import { TokenService } from '../modules/auth/token.service';
import { InMemoryAdminsRepository } from '../modules/auth/repositories/in-memory-admins.repository';
import { InMemorySessionsRepository } from '../modules/auth/repositories/in-memory-sessions.repository';
import { SeedService } from '../seed/seed.service';
import { InMemoryDatabase } from '../store/in-memory.store';
import { OrderEventBus } from '../store/order-event-bus';
import { InMemorySettingsRepository } from '../store/in-memory-settings.repository';
import { VisitorsService } from '../modules/visitors/visitors.service';
import { InMemoryVisitorsRepository } from '../modules/visitors/repositories/in-memory-visitors.repository';
import { BuyerIntelligenceService } from '../modules/buyer-intelligence/buyer-intelligence.service';
import { LeadsService } from '../modules/leads/leads.service';
import { InMemoryLeadsRepository } from '../modules/leads/repositories/in-memory-leads.repository';
import { CrmService } from '../modules/crm/crm.service';
import { InMemoryCrmRepository } from '../modules/crm/repositories/in-memory-crm.repository';
import { InProcessJobQueue } from '../modules/jobs/in-process-job-queue';
import { CommunicationsService } from '../modules/communications/communications.service';
import { InMemoryCommunicationsRepository } from '../modules/communications/repositories/in-memory-communications.repository';
import { CommunicationProviderRegistry } from '../modules/communications/providers/communication-provider.registry';
import { WhatsappProvider } from '../modules/communications/providers/whatsapp.provider';
import { EmailProvider } from '../modules/communications/providers/email.provider';
import { SmsProvider } from '../modules/communications/providers/sms.provider';
import { ManualCallProvider } from '../modules/communications/providers/manual-call.provider';
import { CartRecoveryService } from '../modules/cart-recovery/cart-recovery.service';
import { InMemoryCartRecoveryRepository } from '../modules/cart-recovery/repositories/in-memory-cart-recovery.repository';
import { ShippingService } from '../modules/shipping/shipping.service';
import { InMemoryShippingRepository } from '../modules/shipping/repositories/in-memory-shipping.repository';
import { CourierProviderRegistry } from '../modules/shipping/providers/courier-provider.registry';
import { FetchCourierHttpClient } from '../modules/shipping/providers/courier-http';
import { PathaoProvider } from '../modules/shipping/providers/pathao.provider';
import { SteadfastProvider } from '../modules/shipping/providers/steadfast.provider';
import { RedxProvider } from '../modules/shipping/providers/redx.provider';
import { ReturnsService } from '../modules/returns/returns.service';
import { InMemoryReturnsRepository } from '../modules/returns/repositories/in-memory-returns.repository';
import { SupportService } from '../modules/support/support.service';
import { InMemorySupportRepository } from '../modules/support/repositories/in-memory-support.repository';
import { ReviewsService } from '../modules/reviews/reviews.service';
import { InMemoryReviewsRepository } from '../modules/reviews/repositories/in-memory-reviews.repository';
import { MarketingService } from '../modules/marketing/marketing.service';
import { InMemoryMarketingRepository } from '../modules/marketing/repositories/in-memory-marketing.repository';
import { LoyaltyService } from '../modules/loyalty/loyalty.service';
import { InMemoryLoyaltyRepository } from '../modules/loyalty/repositories/in-memory-loyalty.repository';
import { ReportsService } from '../modules/reports/reports.service';
import { WebsiteService } from '../modules/website/website.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { InMemoryNotificationsRepository } from '../modules/notifications/repositories/in-memory-notifications.repository';
import { StaffService } from '../modules/staff/staff.service';
import { IntegrationsService } from '../modules/integrations/integrations.service';
import { LegalService } from '../modules/legal/legal.service';
import { InMemoryLegalRepository } from '../modules/legal/repositories/in-memory-legal.repository';
import { BackupService } from '../modules/backup/backup.service';
import { InMemoryBackupRepository } from '../modules/backup/repositories/in-memory-backup.repository';
import { AutomationService } from '../modules/automation/automation.service';
import type { SettingsRepository } from '../store/settings.repository';

/**
 * Builds the full service graph over a fresh seeded in-memory
 * store, exactly as the Nest modules wire it, for unit tests.
 */
export interface TestContext {
  db: InMemoryDatabase;
  bus: OrderEventBus;
  catalog: InMemoryCatalogRepository;
  catalogService: CatalogService;
  customers: CustomersService;
  inventory: InMemoryInventoryRepository;
  inventoryService: InventoryService;
  orders: InMemoryOrdersRepository;
  ordersService: OrdersService;
  cartsService: CartsService;
  paymentsRepo: InMemoryPaymentsRepository;
  payments: PaymentsService;
  webhooks: WebhooksService;
  checkout: CheckoutService;
  auditRepo: InMemoryAuditRepository;
  audit: AuditService;
  adminsRepo: InMemoryAdminsRepository;
  sessionsRepo: InMemorySessionsRepository;
  tokens: TokenService;
  auth: AuthService;
  visitorsRepo: InMemoryVisitorsRepository;
  visitors: VisitorsService;
  intelligence: BuyerIntelligenceService;
  leadsRepo: InMemoryLeadsRepository;
  leads: LeadsService;
  crm: CrmService;
  jobQueue: InProcessJobQueue;
  communicationsRepo: InMemoryCommunicationsRepository;
  communications: CommunicationsService;
  cartRecoveryRepo: InMemoryCartRecoveryRepository;
  cartRecovery: CartRecoveryService;
  shippingRepo: InMemoryShippingRepository;
  shippingRegistry: CourierProviderRegistry;
  shipping: ShippingService;
  settingsRepo: SettingsRepository;
  returnsRepo: InMemoryReturnsRepository;
  returns: ReturnsService;
  supportRepo: InMemorySupportRepository;
  support: SupportService;
  reviewsRepo: InMemoryReviewsRepository;
  reviews: ReviewsService;
  marketingRepo: InMemoryMarketingRepository;
  marketing: MarketingService;
  loyaltyRepo: InMemoryLoyaltyRepository;
  loyalty: LoyaltyService;
  reports: ReportsService;
  website: WebsiteService;
  notificationsRepo: InMemoryNotificationsRepository;
  notifications: NotificationsService;
  staff: StaffService;
  integrations: IntegrationsService;
  legalRepo: InMemoryLegalRepository;
  legal: LegalService;
  backupRepo: InMemoryBackupRepository;
  backup: BackupService;
  automation: AutomationService;
}

export function createTestContext(): TestContext {
  const db = new InMemoryDatabase();
  void new SeedService(db).onModuleInit();
  const settings = new InMemorySettingsRepository(db);
  const bus = new OrderEventBus();

  const catalog = new InMemoryCatalogRepository(db);
  const customersRepo = new InMemoryCustomersRepository(db);
  const inventory = new InMemoryInventoryRepository(db);
  const orders = new InMemoryOrdersRepository(db);
  const cartsRepo = new InMemoryCartsRepository(db);
  const paymentsRepo = new InMemoryPaymentsRepository(db);

  const catalogService = new CatalogService(catalog);
  const customers = new CustomersService(customersRepo);
  const auditRepo = new InMemoryAuditRepository(db);
  const audit = new AuditService(auditRepo);
  const inventoryService = new InventoryService(inventory, audit);
  const ordersService = new OrdersService(orders, inventory, bus, audit);
  const cartsService = new CartsService(
    cartsRepo,
    catalog,
    inventoryService,
  );
  const registry = new PaymentProviderRegistry(
    new CodPaymentProvider(),
    new ManualMobileBankingProvider(settings),
    new SslcommerzProvider(),
    new BkashGatewayProvider(),
  );
  const payments = new PaymentsService(
    paymentsRepo,
    orders,
    registry,
    bus,
    audit,
  );
  const webhooks = new WebhooksService(payments, paymentsRepo);
  const adminsRepo = new InMemoryAdminsRepository(db);
  const sessionsRepo = new InMemorySessionsRepository(db);
  const tokens = new TokenService(sessionsRepo);
  const auth = new AuthService(customers, adminsRepo, tokens, audit);
  const visitorsRepo = new InMemoryVisitorsRepository(db);
  const visitors = new VisitorsService(visitorsRepo);
  const intelligence = new BuyerIntelligenceService(visitors);
  const leadsRepo = new InMemoryLeadsRepository(db);
  const leads = new LeadsService(
    leadsRepo,
    visitors,
    intelligence,
    customers,
    orders,
    audit,
  );
  void leads.onModuleInit();
  const crm = new CrmService(
    new InMemoryCrmRepository(db),
    customers,
    customersRepo,
    orders,
    visitors,
    audit,
  );
  const jobQueue = new InProcessJobQueue();
  const communicationsRepo = new InMemoryCommunicationsRepository(db);
  const communications = new CommunicationsService(
    communicationsRepo,
    new CommunicationProviderRegistry(
      new WhatsappProvider(),
      new EmailProvider(),
      new SmsProvider(),
      new ManualCallProvider(),
    ),
    leadsRepo,
    visitors,
    audit,
  );
  const cartRecoveryRepo = new InMemoryCartRecoveryRepository(db);
  const cartRecovery = new CartRecoveryService(
    cartRecoveryRepo,
    cartsRepo,
    cartsService,
    catalog,
    customers,
    visitors,
    communications,
    jobQueue,
    audit,
  );
  const checkout = new CheckoutService(
    catalog,
    cartsRepo,
    cartsService,
    customers,
    orders,
    inventory,
    settings,
    payments,
    visitors,
    leads,
    cartRecovery,
  );
  const shippingRepo = new InMemoryShippingRepository(db);
  const courierHttp = new FetchCourierHttpClient();
  const shippingRegistry = new CourierProviderRegistry(
    new PathaoProvider(courierHttp),
    new SteadfastProvider(courierHttp),
    new RedxProvider(courierHttp),
  );
  const shipping = new ShippingService(
    shippingRepo,
    ordersService,
    paymentsRepo,
    shippingRegistry,
    audit,
  );
  const returnsRepo = new InMemoryReturnsRepository(db);
  const returns = new ReturnsService(
    returnsRepo,
    ordersService,
    inventory,
    paymentsRepo,
    payments,
    audit,
  );
  const supportRepo = new InMemorySupportRepository(db);
  const support = new SupportService(supportRepo, customersRepo, audit);
  const reviewsRepo = new InMemoryReviewsRepository(db);
  const reviews = new ReviewsService(reviewsRepo, catalog, orders, audit);
  const marketingRepo = new InMemoryMarketingRepository(db);
  const marketing = new MarketingService(marketingRepo, audit);
  const loyaltyRepo = new InMemoryLoyaltyRepository(db);
  const loyalty = new LoyaltyService(
    loyaltyRepo,
    orders,
    customersRepo,
    settings,
    audit,
  );
  const reports = new ReportsService(orders, paymentsRepo, cartRecoveryRepo);
  const website = new WebsiteService(settings, audit);
  const notificationsRepo = new InMemoryNotificationsRepository(db);
  const notifications = new NotificationsService(
    notificationsRepo,
    orders,
    inventory,
    catalog,
    cartRecoveryRepo,
  );
  const staff = new StaffService(adminsRepo, sessionsRepo, audit);
  const integrations = new IntegrationsService();
  const legalRepo = new InMemoryLegalRepository(db);
  const legal = new LegalService(legalRepo, audit);
  const backupRepo = new InMemoryBackupRepository(db);
  const backup = new BackupService(
    backupRepo,
    catalog,
    customersRepo,
    orders,
    paymentsRepo,
    leadsRepo,
    cartRecoveryRepo,
    shippingRepo,
    settings,
    audit,
  );
  const automation = new AutomationService(cartRecovery);

  return {
    db,
    bus,
    catalog,
    catalogService,
    customers,
    inventory,
    inventoryService,
    orders,
    ordersService,
    cartsService,
    paymentsRepo,
    payments,
    webhooks,
    checkout,
    auditRepo,
    audit,
    adminsRepo,
    sessionsRepo,
    tokens,
    auth,
    visitorsRepo,
    visitors,
    intelligence,
    leadsRepo,
    leads,
    crm,
    jobQueue,
    communicationsRepo,
    communications,
    cartRecoveryRepo,
    cartRecovery,
    shippingRepo,
    shippingRegistry,
    shipping,
    settingsRepo: settings,
    returnsRepo,
    returns,
    supportRepo,
    support,
    reviewsRepo,
    reviews,
    marketingRepo,
    marketing,
    loyaltyRepo,
    loyalty,
    reports,
    website,
    notificationsRepo,
    notifications,
    staff,
    integrations,
    legalRepo,
    legal,
    backupRepo,
    backup,
    automation,
  };
}

/** A seeded variant lookup for tests: first variant of a product
 * matching a size (and colour, when given). */
export async function findVariant(
  ctx: TestContext,
  productId: string,
  size: string,
  colour?: string,
) {
  const product = await ctx.catalog.findByIdOrSlug(productId);
  if (!product) throw new Error(`seed product missing: ${productId}`);
  const variant = product.variants.find(
    (v) => v.size === size && (!colour || v.colour === colour),
  );
  if (!variant) {
    throw new Error(`seed variant missing: ${productId} ${size}`);
  }
  return { product, variant };
}
