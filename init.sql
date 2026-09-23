-- Schema de inicialização do CaseCellShop (PostgreSQL 16) com UUID nativo

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    qty INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_stock_non_negative CHECK (qty >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(30) NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED, PROCESSING, BILLED, FAILED
    total_amount NUMERIC(10, 2) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, PUBLISHED, FAILED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Índices estratégicos para performance
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status) WHERE status = 'PENDING';

-- Carga inicial de dados com identificadores UUID
INSERT INTO products (id, name, description, price) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Capinha Silicone iPhone 15 Pro - Midnight Black', 'Capa de silicone com toque sedoso e proteção aveludada interna.', 89.90),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Capinha MagSafe Transparente iPhone 15 Pro Max', 'Proteção antiqueda com ímãs integrados para carregamento MagSafe.', 129.90),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Capinha Anti-Impacto Galaxy S24 Ultra - Grafite', 'Bordas reforçadas em TPU e certificação militar contra quedas.', 99.90),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'Capinha Couro Sintético Vintage Galaxy S23', 'Acabamento premium em couro sintético com porta-cartão.', 79.90),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'Capinha Slim Carbon Fiber Pixel 8 Pro', 'Ultra fina em fibra de carbono com grip antiderrapante.', 69.90)
ON CONFLICT (id) DO NOTHING;

INSERT INTO stock (product_id, qty) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 10), -- Configurado para 10 unidades para os testes de concorrência
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 25),
('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 50),
('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 15),
('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 30)
ON CONFLICT (product_id) DO NOTHING;
