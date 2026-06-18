CREATE TABLE IF NOT EXISTS store_settings (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  store_type VARCHAR(50),
  enable_customer_recommendation BOOLEAN DEFAULT TRUE,
  enable_table_management BOOLEAN DEFAULT TRUE,
  enable_refund BOOLEAN DEFAULT TRUE,
  enable_void BOOLEAN DEFAULT TRUE,
  enable_discount BOOLEAN DEFAULT TRUE,
  enable_service_charge BOOLEAN DEFAULT TRUE,
  service_charge_rate DECIMAL(5,2) DEFAULT 0,
  service_charge_percentage DECIMAL(5,2) DEFAULT 0,
  enable_tax BOOLEAN DEFAULT TRUE,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  enable_dine_in BOOLEAN DEFAULT TRUE,
  enable_takeout BOOLEAN DEFAULT TRUE,
  enable_ingredient_customization BOOLEAN DEFAULT TRUE,
  enable_receipt_printing BOOLEAN DEFAULT TRUE,
  enabled_payment_methods TEXT[] DEFAULT ARRAY['Cash', 'GCash', 'Maya', 'Bank Transfer'],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS store_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS enable_customer_recommendation BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_table_management BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_refund BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_void BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_discount BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_service_charge BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS service_charge_rate DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_percentage DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_tax BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_dine_in BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_takeout BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_ingredient_customization BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS enable_receipt_printing BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enabled_payment_methods TEXT[] DEFAULT ARRAY['Cash', 'GCash', 'Maya', 'Bank Transfer'],
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE store_settings
SET service_charge_rate = COALESCE(service_charge_rate, service_charge_percentage, 0),
    service_charge_percentage = COALESCE(service_charge_percentage, service_charge_rate, 0)
WHERE service_charge_rate IS NULL
   OR service_charge_percentage IS NULL;

UPDATE store_settings
SET enabled_payment_methods = ARRAY['Cash', 'GCash', 'Maya', 'Bank Transfer']
WHERE enabled_payment_methods IS NULL
   OR array_length(enabled_payment_methods, 1) IS NULL;

CREATE TABLE IF NOT EXISTS discount_types (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  description TEXT,
  requires_reference_number BOOLEAN DEFAULT FALSE,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discount_settings (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  discount_name VARCHAR(100) NOT NULL,
  discount_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS discount_settings_store_id_idx ON discount_settings(store_id);

CREATE TABLE IF NOT EXISTS product_categories (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  store_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES product_categories(id) ON DELETE SET NULL,
  store_type VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  meal_type VARCHAR(50),
  preparation_time_minutes INT,
  is_dine_in_available BOOLEAN DEFAULT TRUE,
  is_takeout_available BOOLEAN DEFAULT TRUE,
  sku VARCHAR(50),
  barcode VARCHAR(100),
  size VARCHAR(50),
  color VARCHAR(50),
  unit VARCHAR(50),
  stock_quantity INT DEFAULT 0,
  low_stock_limit INT DEFAULT 5,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
  ADD COLUMN IF NOT EXISTS material VARCHAR(100);

CREATE TABLE IF NOT EXISTS product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(50),
  color VARCHAR(50),
  sku VARCHAR(50),
  barcode VARCHAR(100),
  image_url TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_quantity INT DEFAULT 0,
  low_stock_limit INT DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  transaction_type VARCHAR(50) NOT NULL
    CHECK (transaction_type IN ('SALE', 'RESTOCK', 'ADJUSTMENT', 'REFUND', 'VOID')),
  quantity INT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO product_variants (
  product_id, size, color, sku, barcode, image_url, price, stock_quantity, low_stock_limit, is_active
)
SELECT
  p.id,
  p.size,
  p.color,
  p.sku,
  p.barcode,
  p.image_url,
  p.price,
  COALESCE(p.stock_quantity, 0),
  COALESCE(p.low_stock_limit, 5),
  COALESCE(p.is_available, TRUE)
FROM products p
WHERE p.store_type = 'RETAIL_STORE'
  AND NOT EXISTS (
    SELECT 1
    FROM product_variants pv
    WHERE pv.product_id = p.id
  );

CREATE TABLE IF NOT EXISTS ingredients_inventory (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  ingredient_name VARCHAR(150) NOT NULL,
  quantity_available DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  low_stock_limit DECIMAL(12,3) DEFAULT 0,
  cost_per_unit DECIMAL(10,2) DEFAULT 0,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_ingredients (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
  ingredient_name VARCHAR(150) NOT NULL,
  quantity_required DECIMAL(10,3) DEFAULT 0,
  default_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  additional_cost DECIMAL(10,2) DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE,
  is_removable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE product_ingredients
  ADD COLUMN IF NOT EXISTS ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_required DECIMAL(10,3) DEFAULT 0;

UPDATE product_ingredients
SET quantity_required = COALESCE(NULLIF(quantity_required, 0), default_quantity, 0)
WHERE quantity_required IS NULL
   OR quantity_required = 0;

CREATE TABLE IF NOT EXISTS ingredient_alternatives (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  product_ingredient_id BIGINT REFERENCES product_ingredients(id) ON DELETE CASCADE,
  parent_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE CASCADE,
  alternative_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE CASCADE,
  alternative_name VARCHAR(150) NOT NULL,
  default_quantity DECIMAL(10,2),
  unit VARCHAR(50),
  additional_cost DECIMAL(10,2) DEFAULT 0,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ingredient_alternatives
  ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS alternative_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS alternative_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS additional_price DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  table_number VARCHAR(50) NOT NULL,
  capacity INT NOT NULL,
  status VARCHAR(50) DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  cashier_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(150),
  order_type VARCHAR(50) NOT NULL
    CHECK (order_type IN ('DINE_IN', 'TAKEOUT', 'MIXED', 'RETAIL')),
  table_id BIGINT REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_name VARCHAR(50),
  party_size INT,
  subtotal DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_type VARCHAR(100),
  tax_amount DECIMAL(10,2) DEFAULT 0,
  service_charge DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  order_status VARCHAR(50) DEFAULT 'PENDING'
    CHECK (order_status IN ('PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED')),
  payment_status VARCHAR(50) DEFAULT 'NOT_PAID'
    CHECK (payment_status IN ('NOT_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name VARCHAR(150) NOT NULL,
  category_name VARCHAR(100),
  size VARCHAR(50),
  color VARCHAR(50),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  item_type VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS order_item_customizations (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
  product_ingredient_id BIGINT REFERENCES product_ingredients(id) ON DELETE SET NULL,
  ingredient_alternative_id BIGINT REFERENCES ingredient_alternatives(id) ON DELETE SET NULL,
  original_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
  replacement_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
  customization_type VARCHAR(50) NOT NULL
    CHECK (customization_type IN ('REMOVE', 'ADD', 'EXTRA', 'CHANGE_QUANTITY', 'QUANTITY_CHANGE', 'REPLACE', 'NOTE')),
  original_ingredient_name VARCHAR(150),
  replacement_ingredient_name VARCHAR(150),
  original_quantity DECIMAL(10,2),
  new_quantity DECIMAL(10,2),
  unit VARCHAR(50),
  additional_cost DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE order_item_customizations
  ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS original_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS inventory_deductions (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
  ingredient_id BIGINT REFERENCES ingredients_inventory(id) ON DELETE SET NULL,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
  deduction_type VARCHAR(50) NOT NULL,
  quantity_deducted DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE inventory_deductions
  ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS order_queue (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  customer_name VARCHAR(150) NOT NULL,
  party_size INT NOT NULL,
  required_seats INT,
  queue_number INT NOT NULL,
  assigned_table_id BIGINT REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'WAITING'
    CHECK (status IN ('WAITING', 'ASSIGNED', 'SKIPPED', 'CANCELLED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS table_history (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  table_id BIGINT REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  customer_name VARCHAR(150),
  party_size INT,
  occupied_at TIMESTAMP,
  released_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'OCCUPIED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  processed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_number VARCHAR(50) UNIQUE NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  amount_due DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  change_amount DECIMAL(10,2) DEFAULT 0,
  payment_status VARCHAR(50) DEFAULT 'PAID',
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  receipt_data JSONB,
  printed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  movement_type VARCHAR(50) NOT NULL
    CHECK (movement_type IN ('STOCK_IN', 'SALE_DEDUCTION', 'ADJUSTMENT', 'REFUND_RETURN')),
  quantity INT NOT NULL,
  previous_quantity INT,
  new_quantity INT,
  reference_type VARCHAR(50),
  reference_id BIGINT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  refunded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  refund_amount DECIMAL(10,2) DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voided_transactions (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  voided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS product_categories_store_id_idx ON product_categories(store_id);
CREATE INDEX IF NOT EXISTS discount_types_store_id_idx ON discount_types(store_id);
CREATE INDEX IF NOT EXISTS products_store_id_idx ON products(store_id);
CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS product_variants_sku_idx ON product_variants(sku);
CREATE INDEX IF NOT EXISTS product_variants_barcode_idx ON product_variants(barcode);
CREATE INDEX IF NOT EXISTS inventory_transactions_store_id_idx ON inventory_transactions(store_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_variant_id_idx ON inventory_transactions(variant_id);
CREATE INDEX IF NOT EXISTS ingredients_inventory_store_id_idx ON ingredients_inventory(store_id);
CREATE INDEX IF NOT EXISTS product_ingredients_product_id_idx ON product_ingredients(product_id);
CREATE INDEX IF NOT EXISTS product_ingredients_ingredient_id_idx ON product_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS ingredient_alternatives_product_ingredient_id_idx ON ingredient_alternatives(product_ingredient_id);
CREATE INDEX IF NOT EXISTS ingredient_alternatives_parent_ingredient_id_idx ON ingredient_alternatives(parent_ingredient_id);
CREATE INDEX IF NOT EXISTS ingredient_alternatives_alternative_ingredient_id_idx ON ingredient_alternatives(alternative_ingredient_id);
CREATE INDEX IF NOT EXISTS restaurant_tables_store_id_idx ON restaurant_tables(store_id);
CREATE INDEX IF NOT EXISTS orders_store_id_idx ON orders(store_id);
CREATE INDEX IF NOT EXISTS orders_cashier_id_idx ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_variant_id_idx ON order_items(variant_id);
CREATE INDEX IF NOT EXISTS order_item_customizations_order_item_id_idx ON order_item_customizations(order_item_id);
CREATE INDEX IF NOT EXISTS order_queue_store_id_idx ON order_queue(store_id);
CREATE INDEX IF NOT EXISTS order_queue_order_id_idx ON order_queue(order_id);
CREATE INDEX IF NOT EXISTS table_history_store_id_idx ON table_history(store_id);
CREATE INDEX IF NOT EXISTS table_history_order_id_idx ON table_history(order_id);
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON payments(order_id);
CREATE INDEX IF NOT EXISTS receipts_order_id_idx ON receipts(order_id);
CREATE INDEX IF NOT EXISTS inventory_movements_store_id_idx ON inventory_movements(store_id);
CREATE INDEX IF NOT EXISTS inventory_movements_product_id_idx ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS inventory_deductions_store_id_idx ON inventory_deductions(store_id);
CREATE INDEX IF NOT EXISTS inventory_deductions_order_id_idx ON inventory_deductions(order_id);
CREATE INDEX IF NOT EXISTS inventory_deductions_variant_id_idx ON inventory_deductions(variant_id);
