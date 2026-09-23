import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados via Prisma...');

  const productsData = [
    {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Capinha Silicone iPhone 15 Pro - Midnight Black',
      description: 'Capa de silicone com toque sedoso e proteção aveludada interna.',
      price: 89.9,
      stockQty: 10, // 10 unidades para os testes de concorrência
    },
    {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      name: 'Capinha MagSafe Transparente iPhone 15 Pro Max',
      description: 'Proteção antiqueda com ímãs integrados para carregamento MagSafe.',
      price: 129.9,
      stockQty: 25,
    },
    {
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      name: 'Capinha Anti-Impacto Galaxy S24 Ultra - Grafite',
      description: 'Bordas reforçadas em TPU e certificação militar contra quedas.',
      price: 99.9,
      stockQty: 50,
    },
    {
      id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      name: 'Capinha Couro Sintético Vintage Galaxy S23',
      description: 'Acabamento premium em couro sintético com porta-cartão.',
      price: 79.9,
      stockQty: 15,
    },
    {
      id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
      name: 'Capinha Slim Carbon Fiber Pixel 8 Pro',
      description: 'Ultra fina em fibra de carbono com grip antiderrapante.',
      price: 69.9,
      stockQty: 30,
    },
  ];

  for (const item of productsData) {
    await prisma.product.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        description: item.description,
        price: item.price,
      },
      create: {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        stock: {
          create: {
            qty: item.stockQty,
          },
        },
      },
    });

    await prisma.stock.upsert({
      where: { productId: item.id },
      update: {
        qty: item.stockQty,
      },
      create: {
        productId: item.id,
        qty: item.stockQty,
      },
    });
  }

  console.log('✅ Seed do Prisma concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed do Prisma:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

