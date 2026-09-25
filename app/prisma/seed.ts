import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v4 as uuidv4 } from 'uuid';

const rawUrl =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'casecellshop'}:${process.env.DB_PASSWORD || 'casecellshop_pwd'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'casecellshop_db'}?schema=public`;
const connectionString = rawUrl.replace(
  /\${(\w+)}/g,
  (_, k) => process.env[k] || '',
);
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed de 10.000 produtos via Prisma...');

  // 1. Produtos base determinísticos para testes unitários e de concorrência
  const baseProducts = [
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

  for (const item of baseProducts) {
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
      },
    });

    await prisma.stock.upsert({
      where: { productId: item.id },
      update: { qty: item.stockQty },
      create: {
        productId: item.id,
        qty: item.stockQty,
      },
    });
  }

  // 2. Geração de 9.995 produtos adicionais variados para totalizar 10.000 produtos
  const phones = [
    'iPhone 13', 'iPhone 13 Pro', 'iPhone 14', 'iPhone 14 Pro Max',
    'iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max', 'iPhone 16', 'iPhone 16 Pro',
    'Galaxy S22', 'Galaxy S23', 'Galaxy S23 Ultra', 'Galaxy S24', 'Galaxy S24 Ultra',
    'Galaxy Z Flip 5', 'Galaxy Z Fold 5', 'Galaxy A54', 'Galaxy A55',
    'Pixel 7', 'Pixel 8', 'Pixel 8 Pro', 'Pixel 9 Pro',
    'Xiaomi 13', 'Xiaomi 13 Pro', 'Xiaomi 14', 'Redmi Note 13 Pro',
    'Motorola Edge 40', 'Moto G84', 'OnePlus 12',
  ];

  const caseTypes = [
    'Silicone Velvet Touch', 'MagSafe Transparente HD', 'Anti-Impacto Bumper Pro',
    'Couro Legítimo Premium', 'Fibra de Carbono Aero', 'Armadura Metálica Robusta',
    'Ultra Slim Fosca', 'Wallet com Porta-Cartões', 'Glitter Sparkle Deluxe',
  ];

  const colors = [
    'Midnight Black', 'Deep Purple', 'Sierra Blue', 'Alpine Green',
    'Titanium Gray', 'Space Gray', 'Rose Gold', 'Crimson Red',
    'Emerald Green', 'Chalk White', 'Sunset Orange', 'Navy Blue',
  ];

  const TOTAL_TARGET = 10000;
  const currentCount = await prisma.product.count();
  const toGenerate = TOTAL_TARGET - currentCount;

  if (toGenerate <= 0) {
    console.log(`ℹ️ O banco de dados já possui ${currentCount} produtos cadastrados.`);
    return;
  }

  console.log(`📦 Gerando ${toGenerate} novos produtos para atingir o total de ${TOTAL_TARGET}...`);

  const BATCH_SIZE = 2000;
  let productsBatch: { id: string; name: string; description: string; price: number }[] = [];
  let stockBatch: { productId: string; qty: number }[] = [];

  for (let i = 1; i <= toGenerate; i++) {
    const id = uuidv4();
    const phone = phones[i % phones.length];
    const type = caseTypes[(i * 3) % caseTypes.length];
    const color = colors[(i * 7) % colors.length];

    const price = parseFloat((39.9 + (i % 25) * 5 + 0.9).toFixed(2));
    const qty = 5 + (i % 95); // estoque entre 5 e 100 unidades

    productsBatch.push({
      id,
      name: `Capinha ${type} ${phone} - ${color}`,
      description: `Proteção premium para ${phone} com design exclusivo ${type} na cor ${color}.`,
      price,
    });

    stockBatch.push({
      productId: id,
      qty,
    });

    if (productsBatch.length === BATCH_SIZE || i === toGenerate) {
      await prisma.product.createMany({
        data: productsBatch,
        skipDuplicates: true,
      });

      await prisma.stock.createMany({
        data: stockBatch,
        skipDuplicates: true,
      });

      console.log(`  ⏳ Inseridos ${i} de ${toGenerate} produtos...`);
      productsBatch = [];
      stockBatch = [];
    }
  }

  const finalCount = await prisma.product.count();
  console.log(`✅ Seed concluído com sucesso! Total no catálogo: ${finalCount} produtos.`);
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed do Prisma:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
