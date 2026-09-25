# ==========================================
# 1. Stage: Builder
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Dependências nativas necessárias para engines do Prisma no Alpine
RUN apk add --no-cache openssl libc6-compat

# Copia apenas manifestos de pacotes para otimização de cache de camada
COPY package.json package-lock.json ./

RUN npm ci

# Copia configurações e schema Prisma
COPY tsconfig*.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma

# Gera o cliente Prisma tipado
RUN npx prisma generate

# Copia o código-fonte da aplicação
COPY src ./src

# Compila a aplicação NestJS e os scripts de apoio
RUN npm run build

# ==========================================
# 2. Stage: Runner (Produção)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

# Instala bibliotecas de runtime necessárias
RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV PORT=3000

# Copia manifestos, configs e scripts de entrada
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copia dependências e build do stage builder (apenas os artefatos necessários)
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
