import { PrismaService } from '../prisma/prisma.service';
import { PrismaTransactionRunner } from '../prisma/transaction-runner';
import { PrismaSeedService } from '../seed/prisma-seed.service';
import { OrderEventBus } from '../store/order-event-bus';
import { PrismaSettingsRepository } from '../store/prisma-settings.repository';
import { CatalogService } from '../modules/catalog/catalog.service';
import { PrismaCatalogRepository } from '../modules/catalog/repositories/prisma-catalog.repository';
import { CartsService } from '../modules/carts/carts.service';
import { PrismaCartsRepository } from '../modules/carts/repositories/prisma-carts.repository';
import { CheckoutService } from '../modules/checkout/checkout.service';
import { CustomersService } from '../modules/customers/customers.service';
import { PrismaCustomersRepository } from '../modules/customers/repositories/prisma-customers.repository';
import { InventoryService } from '../modules/inventory/inventory.service';
import { PrismaInventoryRepository } from '../modules/inventory/repositories/prisma-inventory.repository';
import { OrdersService } from '../modules/orders/orders.service';
import { PrismaOrdersRepository } from '../modules/orders/repositories/prisma-orders.repository';
import { PaymentsService } from '../modules/payments/payments.service';
import { PrismaPaymentsRepository } from '../modules/payments/repositories/prisma-payments.repository';
import { PaymentProviderRegistry } from '../modules/payments/providers/payment-provider.registry';
import { CodPaymentProvider } from '../modules/payments/providers/cod.provider';
import { ManualMobileBankingProvider } from '../modules/payments/providers/manual-mobile-banking.provider';
import { SslcommerzProvider } from '../modules/payments/providers/sslcommerz.provider';
import { BkashGatewayProvider } from '../modules/payments/providers/bkash-gateway.provider';
import { WebhooksService } from '../modules/webhooks/webhooks.service';
import { AuditService } from '../modules/audit/audit.service';
import { PrismaAuditRepository } from '../modules/audit/repositories/prisma-audit.repository';
import { AuthService } from '../modules/auth/auth.service';
import { TokenService } from '../modules/auth/token.service';
import { PrismaAdminsRepository } from '../modules/auth/repositories/prisma-admins.repository';
import { PrismaSessionsRepository } from '../modules/auth/repositories/prisma-sessions.repository';
import { VisitorsService } from '../modules/visitors/visitors.service';
import { PrismaVisitorsRepository } from '../modules/visitors/repositories/prisma-visitors.repository';
import { BuyerIntelligenceService } from '../modules/buyer-intelligence/buyer-intelligence.service';
import { LeadsService } from '../modules/leads/leads.service';
import { PrismaLeadsRepository } from '../modules/leads/repositories/prisma-leads.repository';
import { CrmService } from '../modules/crm/crm.service';
import { PrismaCrmRepository } from '../modules/crm/repositories/prisma-crm.repository';
import { InProcessJobQueue } from '../modules/jobs/in-process-job-queue';
import { CommunicationsService } from '../modules/communications/communications.service';
import { PrismaCommunicationsRepository } from '../modules/communications/repositories/prisma-communications.repository';
import { CommunicationProviderRegistry } from '../modules/communications/providers/communication-provider.registry';
import { WhatsappProvider } from '../modules/communications/providers/whatsapp.provider';
import { EmailProvider } from '../modules/communications/providers/email.provider';
import { SmsProvider } from '../modules/communications/providers/sms.provider';
import { ManualCallProvider } from '../modules/communications/providers/manual-call.provider';
import { CartRecoveryService } from '../modules/cart-recovery/cart-recovery.service';
import { PrismaCartRecoveryRepository } from '../modules/cart-recovery/repositories/prisma-cart-recovery.repository';
import { ShippingService } from '../modules/shipping/shipping.service';
import { PrismaShippingRepository } from '../modules/shipping/repositories/prisma-shipping.repository';
import { CourierProviderRegistry } from '../modules/shipping/providers/courier-provider.registry';
import { FetchCourierHttpClient } from '../modules/shipping/providers/courier-http';
import { PathaoProvider } from '../modules/shipping/providers/pathao.provider';
import { SteadfastProvider } from '../modules/shipping/providers/steadfast.provider';
import { RedxProvider } from '../modules/shipping/providers/redx.provider';

/**
 * The Prisma counterpart of createTestContext (docs/
 * PRISMA_MIGRATION.md): the same service graph, built over the
 * Prisma repositories against a real database, with the real
 * transaction runner so the transactional flows run as
 * transactions. Gated behind DOSTELO_TEST_DATABASE_URL, which
 * must point at a disposable test database: every public table
 * is truncated before seeding. The job queue stays in-process
 * here; the BullMQ binding is exercised by the live checks, not
 * the service suite.
 */
export interface PrismaTestContext {
  prisma: PrismaService;
  bus: OrderEventBus;
  catalog: PrismaCatalogRepository;
  catalogService: CatalogService;
  customers: CustomersService;
  inventory: PrismaInventoryRepository;
  inventoryService: InventoryService;
  orders: PrismaOrdersRepository;
  ordersService: OrdersService;
  cartsService: CartsService;
  paymentsRepo: PrismaPaymentsRepository;
  payments: PaymentsService;
  webhooks: WebhooksService;
  checkout: CheckoutService;
  auditRepo: PrismaAuditRepository;
  audit: AuditService;
  adminsRepo: PrismaAdminsRepository;
  sessionsRepo: PrismaSessionsRepository;
  tokens: TokenService;
  auth: AuthService;
  visitorsRepo: PrismaVisitorsRepository;
  visitors: VisitorsService;
  intelligence: BuyerIntelligenceService;
  leadsRepo: PrismaLeadsRepository;
  leads: LeadsService;
  crm: CrmService;
  jobQueue: InProcessJobQueue;
  communicationsRepo: PrismaCommunicationsRepository;
  communications: CommunicationsService;
  cartRecoveryRepo: PrismaCartRecoveryRepository;
  cartRecovery: CartRecoveryService;
  shippingRepo: PrismaShippingRepository;
  shippingRegistry: CourierProviderRegistry;
  shipping: ShippingService;
  dispose: () => Promise<void>;
}

export async function createPrismaTestContext(): Promise<PrismaTestContext> {
  const testUrl = process.env.DOSTELO_TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      'DOSTELO_TEST_DATABASE_URL is not set: the Prisma test context needs a disposable test database',
    );
  }
  // PrismaClient reads DATABASE_URL at construction; point it at
  // the test database for this process.
  process.env.DATABASE_URL = testUrl;
  const prisma = new PrismaService();
  const client = prisma.client;
  const tables = await client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await client.$executeRawUnsafe(
      `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
    );
  }
  await new PrismaSeedService(prisma).onModuleInit();

  const settings = new PrismaSettingsRepository(prisma);
  const bus = new OrderEventBus();
  const transactions = new PrismaTransactionRunner(prisma);

  const catalog = new PrismaCatalogRepository(prisma);
  const customersRepo = new PrismaCustomersRepository(prisma);
  const inventory = new PrismaInventoryRepository(prisma);
  const orders = new PrismaOrdersRepository(prisma);
  const cartsRepo = new PrismaCartsRepository(prisma);
  const paymentsRepo = new PrismaPaymentsRepository(prisma);

  const catalogService = new CatalogService(catalog);
  const customers = new CustomersService(customersRepo);
  const auditRepo = new PrismaAuditRepository(prisma);
  const audit = new AuditService(auditRepo);
  const inventoryService = new InventoryService(inventory, audit);
  const ordersService = new OrdersService(
    orders,
    inventory,
    bus,
    audit,
    transactions,
  );
  const cartsService = new CartsService(cartsRepo, catalog, inventoryService);
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
    transactions,
  );
  const webhooks = new WebhooksService(payments, paymentsRepo, transactions);
  const adminsRepo = new PrismaAdminsRepository(prisma);
  const sessionsRepo = new PrismaSessionsRepository(prisma);
  const tokens = new TokenService(sessionsRepo);
  const auth = new AuthService(customers, adminsRepo, tokens, audit);
  const visitorsRepo = new PrismaVisitorsRepository(prisma);
  const visitors = new VisitorsService(visitorsRepo);
  const intelligence = new BuyerIntelligenceService(visitors);
  const leadsRepo = new PrismaLeadsRepository(prisma);
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
    new PrismaCrmRepository(prisma),
    customers,
    customersRepo,
    orders,
    visitors,
    audit,
  );
  const jobQueue = new InProcessJobQueue();
  const communicationsRepo = new PrismaCommunicationsRepository(prisma);
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
  const cartRecoveryRepo = new PrismaCartRecoveryRepository(prisma);
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
    transactions,
  );
  const shippingRepo = new PrismaShippingRepository(prisma);
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

  return {
    prisma,
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
    dispose: async () => {
      await prisma.onModuleDestroy();
    },
  };
}

/** The Prisma context's seeded variant lookup, mirroring
 * findVariant in test-context.ts. */
export async function findPrismaVariant(
  ctx: PrismaTestContext,
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
