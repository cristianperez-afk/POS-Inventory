import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authenticated module isolation (e2e)', () => {
  let app: INestApplication<App>;
  let agent: ReturnType<typeof request.agent>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    agent = request.agent(app.getHttpServer());
  });

  it('logs in and restores the cookie-backed session', async () => {
    await agent
      .post('/api/auth/login')
      .send({ email: 'admin@retail.com', password: 'admin123' })
      .expect(200);

    const session = await agent.get('/api/auth/me').expect(200);
    expect(session.body.user.email).toBe('admin@retail.com');
    expect(session.body.user.modules).toEqual(['RETAIL']);
  });

  it('returns only retail-owned inventory when itemType is omitted', async () => {
    const response = await agent.get('/api/inventory').expect(200);
    expect(
      response.body.data.every((item: { itemType: string }) =>
        ['RETAIL_ITEM', 'BUNDLE'].includes(item.itemType),
      ),
    ).toBe(true);
  });

  it('does not expose a restaurant inventory item by id', async () => {
    const retailAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@retail.com' },
      include: { business: true },
    });
    const location = await prisma.location.findFirstOrThrow({
      where: { businessId: retailAdmin.businessId },
    });
    const restaurantItem = await prisma.inventoryItem.create({
      data: {
        name: 'Isolation Probe Ingredient',
        itemType: 'INGREDIENT',
        sku: `E2E-ISOLATION-${Date.now()}`,
        category: 'Test',
        quantity: 1,
        price: 1,
        locationId: location.id,
        businessId: retailAdmin.businessId,
      },
    });

    try {
      await agent.get(`/api/inventory/${restaurantItem.id}`).expect(404);
      await agent
        .patch(`/api/inventory/${restaurantItem.id}`)
        .send({ name: 'Unauthorized update' })
        .expect(404);
      await agent.delete(`/api/inventory/${restaurantItem.id}`).expect(404);
    } finally {
      await prisma.inventoryItem.delete({
        where: { id: restaurantItem.id },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
