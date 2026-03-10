import * as SQLite from 'expo-sqlite';
import { AdminTenantConfig, IntegrationConfig, ModuleToggles, OrderPayload, UiProfile } from '../../core/types/models';

const db = SQLite.openDatabaseSync('scanner_aux.db');

type ColumnDefinition = { name: string; definition: string };

function tableHasColumn(tableName: string, columnName: string) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return cols.some((col) => col.name === columnName);
}

function ensureColumns(tableName: string, columns: ColumnDefinition[]) {
  for (const column of columns) {
    if (!tableHasColumn(tableName, column.name)) {
      db.execSync(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition};`);
    }
  }
}

function defaultModuleCapsForTenant(tenantId: string): ModuleToggles {
  const clean = tenantId.toLowerCase();
  if (clean.includes('hortfruit') || clean.includes('hortifruit') || clean.includes('varejao')) {
    return {
      scanner: true,
      stockFlow: true,
      serviceFlow: false,
      tableField: false,
      kitchenRouting: false,
      tableClose: false,
      favorites: false,
      topSelling: false,
      history: true,
      manualCode: true,
    };
  }

  return {
    scanner: true,
    stockFlow: true,
    serviceFlow: true,
    tableField: true,
    kitchenRouting: true,
    tableClose: true,
    favorites: true,
    topSelling: true,
    history: true,
    manualCode: true,
  };
}

export function defaultIntegrationConfig(): IntegrationConfig {
  return {
    enabled: false,
    providerName: 'REST Padrao',
    environment: 'production',
    productionBaseUrl: '',
    sandboxBaseUrl: '',
    baseUrl: '',
    timeoutMs: 10000,
    authType: 'none',
    bearerToken: '',
    apiKey: '',
    apiKeyHeader: 'x-api-key',
    endpoints: {
      health: '/health',
      fetchProduct: '/api/products/barcode/{barcode}',
      sendOrder: '/api/orders',
      orderStatus: '/api/orders/client/{clientOrderId}',
      authenticate: '/api/auth/login',
    },
  };
}

function mergeIntegration(input?: Partial<IntegrationConfig> | null): IntegrationConfig {
  const base = defaultIntegrationConfig();
  if (!input) return base;

  return {
    ...base,
    ...input,
    endpoints: {
      ...base.endpoints,
      ...(input.endpoints || {}),
    },
  };
}

function seedAdminTenants() {
  const current = db.getAllSync<{ tenant_id: string }>('SELECT tenant_id FROM admin_tenants LIMIT 1');
  if (current.length > 0) return;

  const seeds: AdminTenantConfig[] = [
    {
      tenantId: 'lanchonete_demo',
      tenantName: 'Lanchonete Demo',
      licenseKey: 'LANCH-2026',
      expiresAt: '2026-12-31T23:59:59Z',
      moduleCaps: defaultModuleCapsForTenant('lanchonete_demo'),
      integrationConfig: defaultIntegrationConfig(),
    },
    {
      tenantId: 'hortfruit_demo',
      tenantName: 'Hort Fruit Demo',
      licenseKey: 'HORT-2026',
      expiresAt: '2026-12-31T23:59:59Z',
      moduleCaps: defaultModuleCapsForTenant('hortfruit_demo'),
      integrationConfig: defaultIntegrationConfig(),
    },
  ];

  for (const seed of seeds) {
    saveAdminTenantConfig(seed);
  }
}

export function initDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ui_profiles (
      tenant_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS module_toggles (
      tenant_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      tenant_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, barcode)
    );

    CREATE TABLE IF NOT EXISTS admin_tenants (
      tenant_id TEXT PRIMARY KEY,
      tenant_name TEXT NOT NULL,
      license_key TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      module_caps TEXT NOT NULL,
      integration_config TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumns('history', [{ name: 'tenant_id', definition: 'TEXT' }]);
  ensureColumns('sync_queue', [{ name: 'tenant_id', definition: 'TEXT' }]);
  ensureColumns('admin_tenants', [{ name: 'integration_config', definition: "TEXT NOT NULL DEFAULT '{}'" }]);

  seedAdminTenants();
}

export function saveHistory(tenantId: string, mode: string, payload: OrderPayload, status: string, externalId?: string) {
  db.runSync(
    'INSERT INTO history (tenant_id, created_at, mode, payload, status, external_id) VALUES (?, ?, ?, ?, ?, ?)',
    [tenantId, new Date().toISOString(), mode, JSON.stringify(payload), status, externalId || null]
  );
}

export function enqueuePayload(tenantId: string, payload: OrderPayload) {
  db.runSync('INSERT INTO sync_queue (tenant_id, created_at, payload, attempts) VALUES (?, ?, ?, ?)', [tenantId, new Date().toISOString(), JSON.stringify(payload), 0]);
}

export function listQueue(tenantId: string) {
  return db.getAllSync<{ id: number; payload: string; attempts: number }>(
    'SELECT id, payload, attempts FROM sync_queue WHERE tenant_id = ? ORDER BY id ASC',
    [tenantId]
  );
}

export function getPendingCount(tenantId: string) {
  const row = db.getFirstSync<{ total: number }>('SELECT COUNT(*) as total FROM sync_queue WHERE tenant_id = ?', [tenantId]);
  return row?.total || 0;
}

export function removeFromQueue(id: number) {
  db.runSync('DELETE FROM sync_queue WHERE id = ?', [id]);
}

export function incrementAttempts(id: number) {
  db.runSync('UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export function listHistory(tenantId: string) {
  return db.getAllSync<{ id: number; created_at: string; mode: string; status: string; external_id: string | null; payload: string }>(
    'SELECT id, created_at, mode, status, external_id, payload FROM history WHERE tenant_id = ? ORDER BY id DESC LIMIT 200',
    [tenantId]
  );
}

export function saveUiProfile(tenantId: string, profile: UiProfile) {
  db.runSync(
    `INSERT INTO ui_profiles (tenant_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    [tenantId, JSON.stringify(profile), new Date().toISOString()]
  );
}

export function loadUiProfile(tenantId: string): UiProfile | null {
  const row = db.getFirstSync<{ payload: string }>('SELECT payload FROM ui_profiles WHERE tenant_id = ?', [tenantId]);
  if (!row) return null;

  try {
    return JSON.parse(row.payload) as UiProfile;
  } catch {
    return null;
  }
}

export function saveModuleToggles(tenantId: string, toggles: ModuleToggles) {
  db.runSync(
    `INSERT INTO module_toggles (tenant_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    [tenantId, JSON.stringify(toggles), new Date().toISOString()]
  );
}

export function loadModuleToggles(tenantId: string): ModuleToggles | null {
  const row = db.getFirstSync<{ payload: string }>('SELECT payload FROM module_toggles WHERE tenant_id = ?', [tenantId]);
  if (!row) return null;

  try {
    return JSON.parse(row.payload) as ModuleToggles;
  } catch {
    return null;
  }
}

export function listFavorites(tenantId: string) {
  return db
    .getAllSync<{ barcode: string }>('SELECT barcode FROM favorites WHERE tenant_id = ? ORDER BY created_at DESC', [tenantId])
    .map((row) => row.barcode);
}

export function toggleFavorite(tenantId: string, barcode: string) {
  const exists = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM favorites WHERE tenant_id = ? AND barcode = ?', [tenantId, barcode]);

  if ((exists?.c || 0) > 0) {
    db.runSync('DELETE FROM favorites WHERE tenant_id = ? AND barcode = ?', [tenantId, barcode]);
    return false;
  }

  db.runSync('INSERT INTO favorites (tenant_id, barcode, created_at) VALUES (?, ?, ?)', [tenantId, barcode, new Date().toISOString()]);
  return true;
}

export function listAdminTenantConfigs(): AdminTenantConfig[] {
  const rows = db.getAllSync<{
    tenant_id: string;
    tenant_name: string;
    license_key: string;
    expires_at: string;
    module_caps: string;
    integration_config: string;
  }>('SELECT tenant_id, tenant_name, license_key, expires_at, module_caps, integration_config FROM admin_tenants ORDER BY tenant_name ASC');

  return rows.map((row) => {
    let moduleCaps = defaultModuleCapsForTenant(row.tenant_id);
    try {
      moduleCaps = { ...moduleCaps, ...JSON.parse(row.module_caps) };
    } catch {
      // keep default caps
    }

    let integrationConfig = defaultIntegrationConfig();
    try {
      integrationConfig = mergeIntegration(JSON.parse(row.integration_config));
    } catch {
      // keep default config
    }

    return {
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      licenseKey: row.license_key,
      expiresAt: row.expires_at,
      moduleCaps,
      integrationConfig,
    };
  });
}

export function loadAdminTenantConfig(tenantId: string): AdminTenantConfig | null {
  const row = db.getFirstSync<{
    tenant_id: string;
    tenant_name: string;
    license_key: string;
    expires_at: string;
    module_caps: string;
    integration_config: string;
  }>('SELECT tenant_id, tenant_name, license_key, expires_at, module_caps, integration_config FROM admin_tenants WHERE tenant_id = ?', [tenantId]);

  if (!row) return null;

  let moduleCaps = defaultModuleCapsForTenant(row.tenant_id);
  try {
    moduleCaps = { ...moduleCaps, ...JSON.parse(row.module_caps) };
  } catch {
    // keep default caps
  }

  let integrationConfig = defaultIntegrationConfig();
  try {
    integrationConfig = mergeIntegration(JSON.parse(row.integration_config));
  } catch {
    // keep default config
  }

  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    licenseKey: row.license_key,
    expiresAt: row.expires_at,
    moduleCaps,
    integrationConfig,
  };
}

export function saveAdminTenantConfig(config: AdminTenantConfig) {
  db.runSync(
    `INSERT INTO admin_tenants (tenant_id, tenant_name, license_key, expires_at, module_caps, integration_config, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
       tenant_name = excluded.tenant_name,
       license_key = excluded.license_key,
       expires_at = excluded.expires_at,
       module_caps = excluded.module_caps,
       integration_config = excluded.integration_config,
       updated_at = excluded.updated_at`,
    [
      config.tenantId,
      config.tenantName,
      config.licenseKey,
      config.expiresAt,
      JSON.stringify(config.moduleCaps),
      JSON.stringify(mergeIntegration(config.integrationConfig)),
      new Date().toISOString(),
    ]
  );
}

