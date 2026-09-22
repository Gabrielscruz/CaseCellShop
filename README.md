# CaseCellShop — Backend Senior Challenge 🚀

Bem-vindo ao repositório da mini-tarefa prática do processo seletivo para Engenheiro(a) Backend Sênior da **CaseCellShop**.

Este projeto implementa uma arquitetura resiliente, de alta performance e desacoplada baseada em **Monólito Modular** com **Clean Architecture** e **DDD**, desenvolvida em **NestJS** e **TypeScript**. O objetivo é solucionar os 3 gargalos críticos da loja virtual:
1. **Performance da Vitrine:** Resolvido com Cache Distribuído (Redis) via Cache-Aside, TTL calibrado e prevenção contra Cache Stampede (Lock Distribuído).
2. **Consistência de Estoque (Zero Overselling):** Resolvido com *Atomic Conditional Update* no PostgreSQL (`UPDATE stock SET qty = qty - $1 WHERE product_id = $2 AND qty >= $1`) e controle de Idempotência no Redis.
3. **Resiliência do Checkout:** Resolvido com Checkout Assíncrono (HTTP 202 Accepted), mensageria via BullMQ (Redis) com retentativas exponenciais, jitter, Dead Letter Queue (DLQ) e Padrão SAGA com Transações Compensatórias.

---

## 1. Arquitetura e Organização de Pastas

A aplicação segue a divisão em camadas isoladas por **Inversão de Dependência (DIP)**:

```text
src/
├── core/                         # 🏛️ Domínio Puro (Entidades e Interfaces/Ports)
│   ├── products/
│   │   ├── product.entity.ts
│   │   └── product.repository.interface.ts
│   └── orders/
│       ├── order.entity.ts
│       └── order.repository.interface.ts
│
├── infra/                        # ⚙️ Infraestrutura Externa e Adapters
│   ├── database/                 # PostgreSQL (Pool nativo e queries puras)
│   │   ├── postgres.pool.ts
│   │   ├── pg-product.repository.ts
│   │   └── pg-order.repository.ts
│   ├── cache/                    # Redis (Cache-Aside + Lock contra Cache Stampede)
│   │   ├── redis.client.ts
│   │   └── redis-cache.service.ts
│   ├── messaging/                # Filas e Workers (BullMQ)
│   │   ├── orders.queue.ts       # Producer de jobs de checkout
│   │   └── orders.processor.ts   # Worker resiliente simulando o ERP legado
│   └── observability/            # Telemetria (Pino JSON + Prometheus metrics)
│       ├── correlation-id.middleware.ts
│       ├── logger.service.ts
│       ├── metrics.service.ts
│       └── metrics.controller.ts
│
├── modules/                      # 📦 Casos de Uso e Controllers NestJS
│   ├── products/                 # GET /products (Cache-Aside com x-cache-status)
│   └── orders/                   # POST /checkout (202 Accepted) e GET /orders/:id/status
├── app.module.ts
└── main.ts
```

---

## 2. Como Executar o Projeto

### Pré-requisitos
- **Node.js:** v18 ou superior (testado na v24)
- **Docker e Docker Compose**

### Passo 1: Subir os serviços de apoio (PostgreSQL e Redis)
```bash
docker compose up -d
```
> O PostgreSQL 16 executará automaticamente o script `init.sql`, criando as tabelas com constraints de integridade (`CHECK (qty >= 0)`) e inserindo as capinhas de celular no catálogo.

### Passo 2: Instalar dependências e compilar
```bash
npm install
npm run build
```

### Passo 3: Iniciar a aplicação
```bash
# Modo Produção
npm run start:prod

# Modo Desenvolvimento (com hot-reload)
npm run start:dev
```
A API estará disponível em `http://localhost:3000`.

---

## 3. Rotas da API e Documentação Interativa (OpenAPI / Swagger)

A especificação interativa OpenAPI 3.0 (Swagger) fica disponível em:  
👉 **`http://localhost:3000/api/docs`**

### 3.1. `GET /products`
Retorna a listagem paginada de capinhas de celular.
- **Cache-Aside:** Na 1ª requisição consulta o PostgreSQL e salva no Redis com TTL de 30 segundos. Na 2ª requisição responde direto da memória do Redis em sub-milissegundos.
- **Prevenção de Cache Stampede:** Utiliza lock distribuído atômico (`SET lock:catalog:... NX PX 2000`).
- **Cabeçalho de Resposta:** `x-cache-status: HIT | MISS`.

```bash
curl -i -X GET "http://localhost:3000/products?page=1&limit=5" \
  -H "x-correlation-id: 550e8400-e29b-41d4-a716-446655440000"
```

### 3.2. `POST /checkout`
Inicia a compra de forma assíncrona com resposta imediata **HTTP 202 Accepted**.
- **Baixa Atômica Condicional:** Evita overselling diretamente no banco.
- **Idempotência Obrigatória:** Exige cabeçalho `Idempotency-Key` para tolerar perda de rede e duplo clique sem duplicar débito de estoque.

```bash
curl -i -X POST "http://localhost:3000/checkout" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: a1b2c3d4-e5f6-7890-abcd-1234567890ab" \
  -H "x-correlation-id: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "items": [
      {
        "productId": "prod-case-001",
        "quantity": 1
      }
    ]
  }'
```
**Resposta (HTTP 202 Accepted):**
```json
{
  "orderId": "ord-7f39b61d-61a0-4355-a0bc-9e58ccff5dfb",
  "status": "ACCEPTED"
}
```

### 3.3. `GET /orders/:orderId/status`
Consulta o ciclo de vida do pedido: `ACCEPTED` ➔ `PROCESSING` ➔ `BILLED` (ou `FAILED`).

```bash
curl -i -X GET "http://localhost:3000/orders/ord-7f39b61d-61a0-4355-a0bc-9e58ccff5dfb/status"
```

---

## 4. Observabilidade e Métricas

### 4.1. Logs Estruturados em JSON (Pino)
Todos os logs registram campos essenciais e propagam o `correlation_id` de ponta a ponta:
```json
{
  "level": "info",
  "time": "2026-09-22T01:09:47.657Z",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "order_id": "ord-7f39b61d-61a0-4355-a0bc-9e58ccff5dfb",
  "msg": "Pedido ord-7f39b61d... processado e faturado com sucesso pelo worker."
}
```

### 4.2. Métricas Prometheus
Disponíveis no endpoint:  
👉 **`GET http://localhost:3000/metrics`**
- `cache_requests_total{status="hit|miss"}`: Hit ratio da vitrine
- `checkout_orders_total{status="accepted|rejected|failed"}`: Funil de pedidos
- `checkout_stockout_rejected_total{product_id}`: Monitoramento de faltas de estoque
- `queue_messages_pushed_total` e `queue_messages_dlq_total`: Monitoramento de filas e DLQ
- `erp_errors_total{endpoint, status_code}`: Erros transitórios do ERP
- `http_request_duration_seconds`: Histogramas p50/p95/p99

---

## 5. Testes Automatizados (Garantia contra Overselling)

O projeto conta com suíte de testes com Jest:

```bash
npm test
```

### Destaque: Teste de Concorrência Extrema (`test/concurrency.spec.ts`)
- **Cenário:** Produto configurado com **10 unidades** de estoque inicial.
- **Estresse:** Disparo simultâneo de **100 requisições concorrentes** via `Promise.all`.
- **Resultado Comprovado:**
  - Exatamente **10 requisições** retornam sucesso (`ACCEPTED`).
  - Exatamente **90 requisições** retornam conflito por falta de estoque (`ConflictException` - HTTP 409).
  - O saldo remanescente é rigorosamente **0 unidades** (Zero Overselling).