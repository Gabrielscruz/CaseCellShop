#!/bin/sh
set -e

echo "⏳ Aguardando banco e sincronizando schema com Prisma..."
npx prisma db push

echo "🌱 Populando catálogo e estoque inicial (seed)..."
node dist/prisma/seed.js || true

echo "🚀 Iniciando servidor CaseCellShop em produção..."
exec node dist/src/main.js
