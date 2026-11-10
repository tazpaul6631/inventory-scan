export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    version INTEGER PRIMARY KEY
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    barcode TEXT,
    price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    weight REAL,
    unit TEXT NOT NULL DEFAULT 'pcs',
    note TEXT,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    sync_status TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    record_id TEXT,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER,
    duration_ms INTEGER,
    created_at INTEGER NOT NULL,
    sync_status TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    retries INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS scan_logs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    format TEXT,
    direction TEXT NOT NULL DEFAULT 'in',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scale_readings (
    id TEXT PRIMARY KEY,
    weight REAL NOT NULL,
    unit TEXT NOT NULL,
    stable INTEGER NOT NULL,
    source TEXT NOT NULL,
    raw TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS offline_factories (
    id INTEGER PRIMARY KEY,
    name TEXT,
    abbr TEXT,
    tenant_id TEXT,
    sno INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS offline_cycles (
    id INTEGER PRIMARY KEY,
    status INTEGER,
    code TEXT,
    scan_date TEXT,
    description TEXT,
    created_at TEXT,
    created_by TEXT,
    updated_at TEXT,
    updated_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS offline_warehouses (
    id INTEGER PRIMARY KEY,
    factory_id INTEGER,
    name TEXT,
    remark TEXT,
    sno INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS offline_positions (
    id INTEGER PRIMARY KEY,
    factory_id INTEGER,
    warehouse_id INTEGER,
    wposition TEXT,
    remark TEXT,
    sno INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS offline_organizations (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT,
    factory_id INTEGER,
    status INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS offline_asset_scans (
    id TEXT PRIMARY KEY,
    factory_id INTEGER,
    warehouse_id INTEGER,
    w_position_id INTEGER,
    w_position TEXT,
    vat_no TEXT,
    order_code TEXT,
    material_name TEXT,
    count REAL,
    cycle_id INTEGER,
    scan_result TEXT,
    scan_at TEXT,
    scan_by TEXT,
    is_complete INTEGER,
    is_success INTEGER,
    is_warning INTEGER,
    is_error INTEGER,
    local_scan_status TEXT,
    local_scan_qty REAL
  )`,
  `CREATE TABLE IF NOT EXISTS offline_scan_commands (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    scan_result TEXT,
    vat_no TEXT,
    cycle_id INTEGER,
    created_at INTEGER NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0,
    sync_error TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
  `CREATE INDEX IF NOT EXISTS idx_products_sync ON products(sync_status)`,
  `CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_warehouses_factory ON offline_warehouses(factory_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_positions_factory ON offline_positions(factory_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_organizations_factory ON offline_organizations(factory_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_asset_scans_cycle ON offline_asset_scans(cycle_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_asset_scans_factory ON offline_asset_scans(factory_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_asset_scans_vat ON offline_asset_scans(vat_no)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_scan_commands_synced ON offline_scan_commands(synced, created_at)`,
]

export const SCHEMA_VERSION = 5
