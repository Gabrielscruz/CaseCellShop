# CaseCellShop — Backend Senior Challenge 🚀

---

## 1. Sobre o Projeto

Este projeto é a implementação da mini-tarefa prática do processo seletivo para Engenheiro(a) Backend Sênior da **CaseCellShop**. O objetivo desta entrega é demonstrar maturidade arquitetural, controle estrito de concorrência, consistência transacional, padrões de cache e instrumentação de observabilidade.

### Escopo e Simplificações Justificadas
Conforme as orientações do enunciado da Parte 1.B:
- **Não há autenticação, front-end ou gateway de pagamento real:** O foco é a integridade transacional e resiliência de engenharia no backend[cite: 1].
- **Integração com ERP legada Simulada:** O faturamento síncrono com o monolito do ERP legado é emulado por um worker assíncrono com injeção proposital de latência e taxa controlada de erro/timeout transitório.
- **Trace/Span Stub Justificado:** Em vez de exigir o provisionamento de um Daemon do Datadog ou Collector OTel pago, a correlação distribuída é garantida via propagação do cabeçalho `x-correlation-id` entre o Controller HTTP, cache Redis, queries do PostgreSQL e payloads do BullMQ Worker (com logs estruturados correlacionados).

---

## 2. Rotas da API e Contratos (OpenAPI / Swagger)

A especificação interativa completa OpenAPI 3.0 (Swagger) fica disponível em:  
👉 **`http://localhost:3000/api/docs`**[cite: 1]

---

### `GET /products`
Retorna a listagem de capinhas para celular com estratégia **Cache-Aside** no Redis e TTL de 30 segundos para manter performance sem entregar dados defasados.
* **Chamada cURL:**
  ```bash
  curl -X GET http://localhost:3000/products \
    -H "x-correlation-id: 550e8400-e29b-41d4-a716-446655440000"