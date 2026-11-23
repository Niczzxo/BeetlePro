import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  // Body parsing is owned by configureApp (explicit size limit,
  // raw bytes kept for webhook signature checks, parser errors
  // answered in the consistent error shape), so Nest's built-in
  // parser stays off.
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  try {
    configureApp(app);
  } catch (error) {
    // Startup configuration errors (for example a missing
    // AUTH_SECRET in production) must be loud and fatal, never a
    // half-configured server.
    console.error(
      `[startup] ${error instanceof Error ? error.message : String(error)}`,
    );
    await app.close();
    process.exit(1);
  }
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
