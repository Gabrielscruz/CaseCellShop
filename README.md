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
├── Dockerfile                    # 🐳 Multi-stage build otimizado (Builder + Runner enxuto)
├── docker-compose.yml            # 🚢 Orquestração de App, PostgreSQL 16, Redis 7 e RabbitMQ 3
├── infra/                        # 🛠️ Configurações declarativas de infraestrutura
│   ├── app/
│   │   └── entrypoint.sh         # Script de inicialização (migrations + seed automático + boot)
│   ├── redis/
│   │   └── redis.conf            # Configuração otimizada (AOF, maxmemory-policy LRU)
│   └── rabbitmq/
│       └── rabbitmq.conf         # Topologia, timeouts e limites de recursos AMQP
├── prisma/
│   ├── schema.prisma             # 📐 Modelos e Mapeamento de Dados Prisma com UUID
│   └── seed.ts                   # 🌱 Seed determinístico de 10.000 produtos e estoque
├── src/
│   ├── core/                     # 🏛️ Domínio Puro (Entidades e Interfaces/Ports)
│   │   ├── products/
│   │   │   ├── product.entity.ts
│   │   │   └── product.repository.interface.ts
│   │   └── orders/
│   │       ├── order.entity.ts
│   │       └── order.repository.interface.ts
│   ├── infra/                    # ⚙️ Infraestrutura Externa e Adapters
│   │   ├── database/             # Prisma ORM (Driver Adapter pg + atomic updates)
│   │   ├── cache/                # Redis (Cache-Aside + Lock contra Cache Stampede)
│   │   ├── messaging/            # Mensageria RabbitMQ (Direct Exchange, DLQ e Consumer)
│   │   └── observability/        # Telemetria (Pino JSON, Prometheus metrics e Tracing)
│   └── modules/                  # 📦 Casos de Uso e Controllers NestJS
│       ├── products/             # GET /products (Cache-Aside com x-cache-status)
│       └── orders/               # POST /checkout (202 Accepted) e GET /orders/:id/status
├── app.module.ts
└── main.ts
```

---

## 2. Como Executar o Projeto

### Pré-requisitos
- **Docker e Docker Compose** instalados (v20+ / Compose v2+)

---

### Opção 1: Execução Completa via Docker Compose (Recomendada — 1 Comando) 🚀

Para inicializar todo o ecossistema (PostgreSQL 16, Redis 7, RabbitMQ 3 e o backend NestJS com aplicação de schema e seed automático):

```bash
docker compose up --build
```

> **O que acontece automaticamente:**
> 1. O contêiner de build compila o TypeScript e prepara os artefatos mínimos em uma imagem final leve baseada em Alpine.
> 2. O contêiner `app` aguarda os healthchecks de PostgreSQL, Redis e RabbitMQ estarem `healthy`.
> 3. O script `entrypoint.sh` sincroniza o schema (`npx prisma db push`), executa o seed de 10.000 produtos e sobe a aplicação.
> 4. A API e a documentação interativa estarão disponíveis imediatamente em **`http://localhost:3000`**.

---

### Opção 2: Execução em Desenvolvimento Local (Host)

Caso prefira rodar o Node.js localmente na máquina host:

```bash
# 1. Subir apenas os serviços de apoio
docker compose up -d postgres redis rabbitmq

# 2. Instalar dependências e preparar o banco
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed

# 3. Iniciar a API em modo desenvolvimento (com hot-reload)
npm run start:dev
```

A API estará disponível em `http://localhost:3000`.

---

## 3. Rotas da API e Documentação Interativa (OpenAPI / Swagger)

A especificação interativa OpenAPI 3.0 (Swagger) fica disponível em:  
👉 **`http://localhost:3000/api/docs`**

### 3.1. `GET /products`
Retorna o catálogo de capinhas com **Cursor-Based Pagination** (eliminação completa de OFFSET para escala $O(1)$ sobre os 10.000 produtos) e **Cache-Aside (Redis)**.
- **Ordenação:** `created_at DESC`, `id DESC` (determinística com índice composto `idx_products_created_at_id`).
- **Cursor Opaque:** Serializado em Base64 a partir de `{ createdAt, id }`.
- **Chave de Cache no Redis:** `catalog:cursor:${cursor || 'first'}:limit:${limit}` com TTL de 30s.
- **Prevenção de Cache Stampede:** Lock distribuído atômico no Redis (`SET lock:catalog:cursor:... NX PX 2000`).
- **Cabeçalho de Resposta:** `x-cache-status: HIT | MISS`.

* **1ª Página (sem cursor):**
  ```bash
  curl -i -X GET "http://localhost:3000/products?limit=10" \
    -H "x-correlation-id: 550e8400-e29b-41d4-a716-446655440000"
  ```
  *Exemplo de Resposta:*
  ```json
  {
    "items": [...],
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTIyVDIxOjQxOjAwLjAwMFoiLCJpZCI6ImEwZWViYzk5LTljMGItNGVmOC1iYjZkLTZiYjliZDM4MGExMSJ9",
    "hasMore": true,
    "limit": 10
  }
  ```

* **Próxima Página (usando o nextCursor retornado):**
  ```bash
  curl -i -X GET "http://localhost:3000/products?limit=10&cursor=eyJjcmVhdGVkQXQiOiIyMDI2LTA5LTIyVDIxOjQxOjAwLjAwMFoiLCJpZCI6ImEwZWViYzk5LTljMGItNGVmOC1iYjZkLTZiYjliZDM4MGExMSJ9" \
    -H "x-correlation-id: 550e8400-e29b-41d4-a716-446655440000"
  ```

### 3.2. `GET /health`
Verifica ativamente a integridade e prontidão da aplicação, checando a conectividade real do PostgreSQL (via Prisma) e do Redis.
```bash
curl -i -X GET "http://localhost:3000/health"
```
*Exemplo de Resposta (HTTP 200 OK):*
```json
{
  "status": "ok",
  "timestamp": "2026-09-22T22:28:00.000Z",
  "uptimeSeconds": 42.5,
  "services": {
    "database": "up",
    "redis": "up"
  }
}
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
        "productId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "quantity": 1
      }
    ]
  }'
```
**Resposta (HTTP 202 Accepted):**
```json
{
  "orderId": "7f39b61d-61a0-4355-a0bc-9e58ccff5dfb",
  "status": "ACCEPTED"
}
```

### 3.3. `GET /orders/:orderId/status`
Consulta o ciclo de vida do pedido: `ACCEPTED` ➔ `PROCESSING` ➔ `BILLED` (ou `FAILED`).

```bash
curl -i -X GET "http://localhost:3000/orders/7f39b61d-61a0-4355-a0bc-9e58ccff5dfb/status"
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

### 4.3. Tratamento de Erros Desacoplado (Domain Errors ➔ Interceptor ➔ Exception Filter)

A aplicação implementa o padrão arquitetural de desacoplamento entre regras de negócio e camada de transporte HTTP:
- **Services Puros:** Os serviços de domínio lançam exclusivamente erros semânticos da aplicação (`InsufficientStockError`, `ProductNotFoundError`, `DuplicateTransactionError`), sem conhecer detalhes de HTTP (permitindo reuso por workers AMQP, filas ou gRPC).
- **`ErrorHandlerInterceptor`:** Intercepta os erros de negócio e do banco (Prisma `P2002`, `P2025`, `P2003`) e os converte em exceções HTTP adequadas (`ConflictException`, `NotFoundException`, `BadRequestException`).
- **`GlobalExceptionFilter`:** Padroniza a resposta JSON de erro com `correlationId`, `statusCode`, `path`, `timestamp` e emite logs estruturados (Warn para 4xx, Error com stack trace para 5xx).

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

---

## 6. Rastreabilidade Distribuída (Trace / Span Stub)

Para manter a solução leve e executável localmente sem a necessidade de hospedar um coletor OpenTelemetry (Jaeger/Zipkin/Datadog Agent), a aplicação adota uma estratégia de **Tracing Distribuído via W3C TraceContext / Correlation ID** propagado de forma contextual contínua:

1. **Camada HTTP (Ingress):** O `CorrelationIdMiddleware` captura ou gera um `x-correlation-id` (UUID v4) e o injeta no `AsyncLocalStorage`.
2. **Camada de Cache (Redis):** Operações de lock e leitura utilizam chaves com logs correlacionados.
3. **Persistência (PostgreSQL):** Pedidos e itens são associados à chave de idempotência e correlation context.
4. **Mensageria (RabbitMQ):** O produtor (`publish`) injeta o `correlationId` no payload da mensagem e nos headers AMQP.
5. **Worker em Segundo Plano (`OrdersConsumer`):** O consumidor extrai o `correlationId` da mensagem e o vincula a todos os logs de transição de estado (`ACCEPTED` ➔ `PROCESSING` ➔ `BILLED`), fechando o ciclo do span distribuído da requisição original até o faturamento.

---

## 7. Observabilidade Datadog / Grafana: Dashboards, Alertas e Runbook

### 7.1. Proposta de Dashboard (Datadog / Grafana)
* **Widget 1 (Time-series):** Taxa de Checkout e Funil de Pedidos (`sum by (status) (rate(checkout_orders_total[1m]))`).
* **Widget 2 (Gauge/Single Value):** Cache Hit Ratio da Vitrine (`sum(rate(cache_requests_total{status="hit"}[5m])) / sum(rate(cache_requests_total[5m])) * 100`). Target: > 85%.
* **Widget 3 (Bar/Count):** Mensagens na DLQ (`queue_messages_dlq_total`). Target: 0.
* **Widget 4 (Heatmap/Percentiles):** Latência p95 e p99 de listagem de catálogo e checkout (`http_request_duration_seconds`).

### 7.2. Alertas Críticos (Monitors)

#### Alerta 1: DLQ com mensagens acumuladas (Severidade: P1 - Crítico)
* **Condição:** `sum(queue_messages_dlq_total) > 0` por mais de 2 minutos.
* **Mensagem:** `[CRÍTICO] Pedidos não processados foram parar na DLQ (orders.dlq). Possível indisponibilidade ou inconsistência no processamento assíncrono.`

#### Alerta 2: Taxa de rejeição por falta de estoque anormal (Severidade: P2 - Aviso)
* **Condição:** `sum(rate(checkout_stockout_rejected_total[5m])) > 10` por 5 minutos.
* **Mensagem:** `[AVISO] Pico de rejeição por esgotamento de estoque (Flash Sale detectado ou reposição necessária).`

### 7.3. Runbook Operacional (Resposta a Incidentes)

#### Runbook: Mensagens na Dead Letter Queue (`orders.dlq`)
1. **Identificação:** Filtrar logs estruturados pelo Datadog com a tag `queue: "orders.dlq"` ou buscar mensagens no RabbitMQ Management (`http://localhost:15672`).
2. **Diagnóstico:** Extrair o `correlation_id` e o `order_id` dos metadados da mensagem rejeitada.
3. **Inspeção do Erro:** Verificar o campo `failureReason` na tabela `orders` do PostgreSQL ou no log de erro do `OrdersConsumer`.
4. **Remediação:**
   - Se foi falha de timeout/conectividade com ERP: acionar o comando de reprocessamento (shovel/re-enqueue) da DLQ para `orders.process`.
   - Se o pedido foi cancelado definitivamente: o estorno atômico de estoque (`incrementStockAtomic`) é acionado automaticamente pela compensação da SAGA.

---

## 8. Decisões Arquiteturais, Trade-offs e Limitações

| Decisão / Abordagem | Alternativa Rejeitada | Justificativa e Trade-offs |
| :--- | :--- | :--- |
| **RabbitMQ com AMQP nativo** | Redis BullMQ ou Kafka | AMQP nativo fornece suporte robusto a Direct Exchanges duráveis, Prefetch QoS e Dead Letter Exchanges (DLQ) sem overhead de cluster Kafka. |
| **Baixa Atômica Condicional no Postgres** | Lock Pessimista (`SELECT FOR UPDATE`) | `UPDATE stock SET quantity = quantity - $1 WHERE quantity >= $1` não bloqueia leitura de outros produtos e elimina deadlocks comuns em `SELECT FOR UPDATE` sob alta concorrência. |
| **Paginação por Cursor Opaque (Base64)** | Paginação por Offset (`LIMIT x OFFSET y`) | Offset degrada para $O(N)$ em tabelas grandes e gera inconsistências com inserts/deletes concorrentes. Cursor tem custo $O(1)$ constante via índice composto `(created_at, id)`. |
| **Idempotência no Redis + Unique DB** | Apenas checagem no banco | Chave no Redis com lock atômico responde retentativas em menos de 10ms sem onerar a pool de conexões do PostgreSQL. |
| **Simplificações do Desafio** | E-commerce completo | Autenticação omitida, envio ao ERP simulado pelo worker com delay programado de 5s entre status, sem gateway financeiro real (foco estritamente na engenharia de backend e concorrência). |