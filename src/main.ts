import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseInterceptor } from './interceptors/response/response.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render sits in front of us as a reverse proxy. Without this, Express
  // ignores X-Forwarded-For and req.ip resolves to Render's internal proxy
  // IP for every request from every user — which means ThrottlerGuard's
  // per-IP rate limit is actually shared across the whole platform instead
  // of being per-visitor. `1` = trust the first hop (Render), not the full
  // chain, so a client can't spoof X-Forwarded-For to dodge the limit.
  app.set('trust proxy', 1);

app.enableCors({
  origin: [
    "http://localhost:5173",
    "https://frogmbte.vercel.app",
    "https://hofgmbte.vercel.app", // hof now calls this API directly for tributes/nominations
    "https://gmbtefro.vercel.app",
    "https://www.gmblacktechexpo.co.uk", // optional if you still use preview deployments
  ],
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "Authorization"],
});

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      enableDebugMessages: true,
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // --- Swagger / OpenAPI docs ---
  // Gated behind an env flag in production so the full route map isn't public by default.
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('GMBTE API')
      .setDescription(
        'Backend API for the GMBTE platform — Academy, Green Impact, Opportunities, Hall of Fame, and admin endpoints.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'JWT', in: 'header' },
        'access-token',
      )
      .addTag('auth', 'Authentication and account management')
      .addTag('opportunities', 'Job/opportunity search and admin management')
      .addTag('admin', 'Admin-only endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // ⭐ Start server last
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
