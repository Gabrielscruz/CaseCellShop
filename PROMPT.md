Diretrizes de Engenharia, Regras de Código e Prompts de IA

Este documento reúne o guia de estilo de código (Clean Code, SOLID e DDD em NestJS) e o registro dos prompts estratégicos utilizados para direcionar a Inteligência Artificial no desenvolvimento do desafio técnico da **CaseCellShop**.

---

## Parte 1: System Prompt & Regras de Código (Clean Code, SOLID & DDD em NestJS)

### 1. Filosofia e Testabilidade
- **Foco em Testabilidade:** Código limpo é fácil de isolar e testar. A regra de negócio não depende de ORMs, banco ou detalhes de infraestrutura.
- **Simplicidade (KISS):** Evitar complexidade desnecessária ou abstrações prematuras.
- **Isolamento de Domínio:** O Core Domain deve funcionar com implementações em memória (`InMemoryRepository`) para testes unitários rápidos.

### 2. Nomenclatura e Tipagem
- **Código 100% em Inglês:** Classes, métodos, variáveis, DTOs e tabelas em inglês sem abreviações (`user` em vez de `u`, `orderId` em vez de `idPed`).
- **Eliminação de Nomes Genéricos:** Proibido o uso de `data`, `info`, `response`, `args`. Prefira nomes semânticos como `productCatalog` ou `checkoutPayload`.
- **Booleanos Semânticos:** Indicar a causa e preferir perguntas positivas (ex.: `isStockAvailable`, `isOrderProcessing`).
- **Sem Números Mágicos:** Constantes explícitas e expressivas (ex.: `const CACHE_TTL_IN_SECONDS = 30;`).

### 3. Estruturação e Padrões de Projeto (SOLID)
- **Single Responsibility (SRP):** Cada Use Case possui um único método público `execute()`.
- **Dependency Inversion (DIP):** Use Cases dependem de interfaces abstratas injetadas no construtor (`@Inject('ProductRepository') private readonly productRepo: ProductRepository`), nunca de implementações concretas acopladas ao framework.
- **Early Return:** Sem aninhamento excessivo ou blocos `else`.
- **Desestruturação Explícita:** Extração nominal de propriedades em DTOs e retornos encapsulados.

---

## Parte 2: Arquitetura & Diretrizes Práticas do Desafio CaseCellShop

Para atender integralmente aos critérios de avaliação sem custos de nuvem:
1. **Framework:** NestJS com TypeScript.
2. **Cache:** Redis (`ioredis` / `@nestjs-modules/ioredis`) com Cache-Aside e TTL curto na vitrine.
3. **Persistência Própria:** PostgreSQL (via Docker) com **Atomic Conditional Update** (`UPDATE stock SET qty = qty - $1 WHERE id = $2 AND qty >= $1`) para erradicar o overselling.
4. **Mensageria/Fila:** Redis + BullMQ (ou SQS local) para checkout assíncrono com retries, exponential backoff, jitter e DLQ.
5. **Observabilidade:** Logs estruturados em JSON (Pino) com `correlationId` em todo o ciclo de vida, traces e métricas (Prometheus / `prom-client`).

---

## Parte 3: Registro de Prompts de IA por Domínio

### Prompt 01: Setup de Infraestrutura Gratuita e Local
> **Contexto:** Subir o ecossistema local e gratuito para atender o desafio sem dependência de nuvem paga.  
> **Prompt:**  
> *"Gere um arquivo `docker-compose.yml` para rodar localmente:  
> 1. PostgreSQL 16 (porta 5432) com script de inicialização criando as tabelas `products`, `stock` (com constraint `CHECK (qty >= 0)`), `orders` e `outbox`.  
> 2. Redis 7 Alpine (porta 6379) para cache e fila BullMQ.  
> Adicione healthchecks e configure a rede Docker para permitir conexão direta da aplicação NestJS."*  
> **Revisão Humana:** A constraint `CHECK (qty >= 0)` foi mantida como salvaguarda no banco para impedir inconsistências mesmo em falhas de aplicação.

---

### Prompt 02: Contrato OpenAPI e Schemas de Resposta no NestJS
> **Contexto:** A especificação exige OpenAPI formal para a vitrine e o checkout assíncrono.  
> **Prompt:**  
> *"Crie a configuração do Swagger (`@nestjs/swagger`) e os DTOs com validação (`class-validator`) em NestJS:  
> - `GET /products`: Listagem paginada de capinhas de celular com cabeçalho de resposta `x-cache-status: HIT | MISS`.  
> - `POST /checkout`: Recebe o cabeçalho obrigatório `Idempotency-Key` (UUID) e os itens do pedido. Retorna `HTTP 202 Accepted` com `{ orderId, status: 'ACCEPTED' }`, ou `HTTP 409 Conflict` em caso de falta de estoque ou duplicidade.  
> - `GET /orders/:orderId/status`: Retorna o ciclo do pedido (`ACCEPTED`, `PROCESSING`, `BILLED`, `FAILED`).  
> Adicione esquemas de erro 400, 404, 409 e 500 contendo `correlationId`."*  
> **Revisão Humana:** Garantiu-se que o endpoint de checkout responda 202 imediatamente, desacoplando o faturamento da thread HTTP.

---

### Prompt 03: Cache-Aside com Prevenção de Cache Stampede
> **Contexto:** Atender a vitrine de produtos de alta performance sem sobrecarregar a réplica do ERP.  
> **Prompt:**  
> *"Escreva um Use Case `GetProductsUseCase` em NestJS seguindo DDD e SOLID:  
> 1. Consulte o Redis (`ioredis`) buscando a chave da página do catálogo.  
> 2. Havendo cache miss, implemente proteção contra Cache Stampede adquirindo um lock temporário (`SET lock:catalog:page:1 token NX PX 2000`). Apenas a requisição que obteve o lock consulta o repositório; as demais aguardam brevemente e consultam o cache preenchido.  
> 3. Salve o resultado no Redis com TTL de 30 segundos e registre a métrica de hit/miss via Prometheus.  
> Injete o `correlationId` nos logs estruturados em JSON."*  
> **Revisão Humana:** Calibrou-se o timeout do lock distribuído para evitar contenções longas caso o banco enfrente picos.

---

### Prompt 04: Concorrência, Idempotência e Atomic Update contra Overselling
> **Contexto:** Evitar compras duplicadas por duplo clique e assegurar que nenhum produto seja vendido sem estoque real.  
> **Prompt:**  
> *"Implemente o `ProcessCheckoutUseCase` em NestJS:  
> 1. Idempotência: Registre no Redis a chave `SET idempotency:<uuid> 'PROCESSING' NX EX 120`. Se a chave já existir, retorne a resposta salva ou lance `ConflictException` (HTTP 409).  
> 2. Baixa de estoque atômica: Execute diretamente no PostgreSQL a instrução condicional:  
>    `UPDATE stock SET qty = qty - $1 WHERE product_id = $2 AND qty >= $1 RETURNING qty;`  
>    Proíba estritamente checagens de estoque em memória (`if stock >= qty`). Se nenhuma linha for atualizada, lance `OutOfStockException`.  
> 3. Persista o pedido em `orders` com status `ACCEPTED` e enfileire o evento na fila assíncrona."*  
> **Revisão Humana:** O uso exclusivo do Atomic Update elimina condições de corrida no nível do banco, dispensando locks de longa duração.

---

### Prompt 05: Processador Assíncrono com Retry, Jitter e DLQ
> **Contexto:** Simular o ERP legado lento e instável, processando pedidos em segundo plano com resiliência.  
> **Prompt:**  
> *"Implemente um Processor BullMQ (`@Processor('orders-queue')`) em NestJS:  
> 1. Consuma o evento contendo `orderId` propagando o `correlationId` nos logs.  
> 2. Simule a chamada HTTP ao ERP legado com simulação de timeout ou falha intermitente.  
> 3. Configure política de retry com Exponential Backoff e Jitter (3 tentativas).  
> 4. Esgotadas as retentativas, envie o job para a Dead Letter Queue (DLQ), atualize o status do pedido para `FAILED` e execute a transação compensatória de reversão do estoque.  
> 5. Exponha a métrica `queue_messages_dlq_total`."*  
> **Revisão Humana:** Validou-se a compensação para estornar a quantidade ao estoque original caso o faturamento falhe de forma terminal.

---

### Prompt 06: Teste de Carga e Concorrência Automatizado
> **Contexto:** Provar programaticamente que a solução é imune a overselling sob alto volume de acessos concorrentes.  
> **Prompt:**  
> *"Crie um teste de integração em Jest/Vitest:  
> 1. Crie um produto com estoque inicial de exatamente 10 unidades.  
> 2. Dispare 100 requisições simultâneas de compra via `Promise.all`, cada uma com um `Idempotency-Key` distinto.  
> 3. Assegure que:  
>    - Exatamente 10 requisições recebam HTTP 202 Accepted.  
>    - Exatamente 90 requisições recebam HTTP 409 Conflict (estoque esgotado).  
>    - O saldo remanescente do produto no PostgreSQL termine rigorosamente em 0 (zero)."*  
> **Revisão Humana:** O teste valida a integridade ACID sob alta concorrência concorrente.

---

### Prompt 07: Observabilidade, Métricas Prometheus e Runbooks
> **Contexto:** Atender aos requisitos de monitoramento, traces conceituais e documentação de operação para Datadog/Prometheus.  
> **Prompt:**  
> *"Crie um módulo de métricas em NestJS com `prom-client` expondo `GET /metrics`:  
> - `cache_requests_total{status='hit'|'miss'}` (Counter)  
> - `checkout_orders_total{status='accepted'|'rejected'|'failed'}` (Counter)  
> - `http_request_duration_seconds` (Histogram com percentis p50, p95, p99)  
> - `queue_messages_dlq_total` e `queue_messages_waiting` (Counters/Gauges)  
> Escreva para o README um modelo de Runbook detalhando a ação imediata para o alerta 'Spike na DLQ / Lag de Fila'."*  
> **Revisão Humana:** As métricas foram padronizadas nos moldes solicitados para manter equivalência direta com o Datadog.

---

### Prompt 08: Containerização Multi-Stage e Orquestração 1-Click (Docker Compose)
> **Contexto:** Permitir que o avaliador técnico clone o repositório e execute a stack completa em produção com um único comando sem depender de ferramentas instaladas no host.  
> **Prompt:**  
> *"Gere um `Dockerfile` multi-stage build para a aplicação NestJS com Prisma e Alpine:  
> 1. Stage Builder: Instale dependências via `npm ci`, gere o cliente tipado do Prisma (`prisma generate`) e compile o TypeScript.  
> 2. Stage Runner: Crie uma imagem final limpa e enxuta (`node:22-alpine`) contendo apenas os artefatos compilados e dependências necessárias.  
> 3. Crie arquivos de configuração declarativos em `infra/redis/redis.conf` e `infra/rabbitmq/rabbitmq.conf`.  
> 4. No `docker-compose.yml`, orquestre o serviço `app` com `depends_on` condicional a `service_healthy` para PostgreSQL, Redis e RabbitMQ, executando um `entrypoint.sh` que sincroniza o schema do Prisma e realiza o seed automaticamente antes do boot da API."*  
> **Revisão Humana:** Garantiu-se o isolamento dos contêineres, healthchecks ativos e zero atrito de setup na inicialização com `docker compose up --build`.