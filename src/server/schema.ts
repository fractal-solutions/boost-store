export const schemaSql = `
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'KES',
  contact_email TEXT DEFAULT '',
  announcement TEXT DEFAULT '',
  theme TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  compare_at_price REAL,
  category TEXT DEFAULT '',
  image TEXT DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  stock INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  featured INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 4.6,
  warehouse_id TEXT DEFAULT '',
  cost REAL NOT NULL DEFAULT 0,
  track_inventory INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, status);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vendors_store ON vendors(store_id);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_id TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  received_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_store ON purchases(store_id, created_at);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

CREATE TABLE IF NOT EXISTS purchase_payments (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  vendor_id TEXT DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  gateway TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON purchase_payments(purchase_id);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  street_address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT '',
  latitude REAL,
  longitude REAL,
  hours TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_warehouses_store ON warehouses(store_id);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  in_transit INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (product_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_store ON inventory(store_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id TEXT DEFAULT '',
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(store_id, product_id, created_at);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  birthday TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (store_id, email)
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_otps (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  purpose TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_otps ON customer_otps(store_id, email, purpose, status);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  payment_timing TEXT NOT NULL DEFAULT 'prepay',
  subtotal REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  delivery_provider TEXT DEFAULT '',
  delivery_quote_id TEXT DEFAULT '',
  delivery_id TEXT DEFAULT '',
  delivery_status TEXT DEFAULT '',
  tracking_url TEXT DEFAULT '',
  eta_minutes INTEGER DEFAULT 0,
  progress_percent INTEGER DEFAULT 0,
  pickup_address TEXT DEFAULT '',
  dropoff_address TEXT DEFAULT '',
  pickup_warehouse_id TEXT DEFAULT '',
  pickup_stops INTEGER NOT NULL DEFAULT 1,
  pickup_latitude REAL,
  pickup_longitude REAL,
  dropoff_latitude REAL,
  dropoff_longitude REAL,
  courier_latitude REAL,
  courier_longitude REAL,
  courier_name TEXT DEFAULT '',
  courier_phone TEXT DEFAULT '',
  courier_updated_at TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_gateway TEXT DEFAULT '',
  payment_reference TEXT DEFAULT '',
  payment_transaction_id TEXT DEFAULT '',
  stock_state TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(delivery_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  image TEXT DEFAULT '',
  line_total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_courier_pings (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  status TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_courier_pings_order ON order_courier_pings(order_id, created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  location TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT DEFAULT '',
  transaction_id TEXT DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_txn ON payments(transaction_id);
`;
