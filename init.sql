-- Schema de inicialização do CaseCellShop (PostgreSQL 16)

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock (
    product_id VARCHAR(36) PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    qty INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_stock_non_negative CHECK (qty >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(30) NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED, PROCESSING, BILLED, FAILED
    total_amount NUMERIC(10, 2) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(36) NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
    id VARCHAR(36) PRIMARY KEY,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id VARCHAR(36) NOT NULL,
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

-- Carga inicial de dados (Capinhas para celular)
INSERT INTO products (id, name, description, price) VALUES
('prod-case-001', 'Capinha Silicone iPhone 15 Pro - Midnight Black', 'Capa de silicone com toque sedoso e proteção aveludada interna.', 89.90),
('prod-case-002', 'Capinha MagSafe Transparente iPhone 15 Pro Max', 'Proteção antiqueda com ímãs integrados para carregamento MagSafe.', 129.90),
('prod-case-003', 'Capinha Anti-Impacto Galaxy S24 Ultra - Grafite', 'Bordas reforçadas em TPU e certificação militar contra quedas.', 99.90),
('prod-case-004', 'Capinha Couro Sintético Vintage Galaxy S23', 'Acabamento premium em couro sintético com porta-cartão.', 79.90),
('prod-case-005', 'Capinha Slim Carbon Fiber Pixel 8 Pro', 'Ultra fina em fibra de carbono com grip antiderrapante.', 69.90)
ON CONFLICT (id) DO NOTHING;

INSERT INTO stock (product_id, qty) VALUES
('prod-case-001', 10), -- Configurado para 10 unidades para os testes de concorrência
('prod-case-002', 25),
('prod-case-003', 50),
('prod-case-004', 15),
('prod-case-005', 30)
ON CONFLICT (product_id) DO NOTHING;

