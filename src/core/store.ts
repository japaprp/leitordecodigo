import { create } from 'zustand';
import { MockPdvAdapter } from '../integrations/adapters/mockPdvAdapter';
import {
  enqueuePayload,
  getPendingCount,
  incrementAttempts,
  listHistory,
  listQueue,
  loadModuleToggles,
  loadUiProfile,
  removeFromQueue,
  saveHistory,
  saveModuleToggles,
  saveUiProfile,
} from '../data/storage/localDb';
import {
  DispatchTarget,
  FeatureFlags,
  ModuleToggles,
  Operator,
  OrderPayload,
  PaymentMethod,
  Product,
  ScannedItem,
  SessionContext,
  TenantContext,
  UiProfile,
} from './types/models';

interface SyncSummary {
  synced: number;
  duplicates: number;
  failed: number;
}

interface AppState {
  operator: Operator | null;
  tenant: TenantContext | null;
  session: SessionContext | null;
  mode: 'scanner' | 'stock' | 'table';
  uiProfile: UiProfile;
  moduleToggles: ModuleToggles;
  items: ScannedItem[];
  sending: boolean;
  forceOffline: boolean;
  pendingCount: number;
  syncState: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt: string | null;
  setForceOffline: (value: boolean) => void;
  canUseMode: (mode: 'scanner' | 'stock' | 'table') => boolean;
  canUseFeature: (feature: keyof ModuleToggles) => boolean;
  login: (params: {
    tenantId: string;
    licenseKey: string;
    name: string;
    password: string;
    role: Operator['role'];
  }) => Promise<void>;
  setSession: (session: SessionContext) => void;
  setMode: (mode: 'scanner' | 'stock' | 'table') => void;
  setUiProfile: (profile: UiProfile) => void;
  setModuleToggles: (toggles: Partial<ModuleToggles>) => void;
  addByProduct: (product: Product) => void;
  addManualBarcode: (barcode: string) => Promise<{ ok: boolean; message?: string }>;
  updateQty: (barcode: string, delta: number) => void;
  removeItem: (barcode: string) => void;
  clearItems: () => void;
  total: () => number;
  sendCurrentOrder: () => Promise<{ ok: boolean; offlineQueued?: boolean; message?: string }>;
  closeTable: (params: {
    subtotal: number;
    discount: number;
    serviceFee: number;
    method: PaymentMethod;
  }) => Promise<{ ok: boolean; offlineQueued?: boolean; message?: string }>;
  refreshPendingCount: () => void;
  syncPending: () => Promise<SyncSummary>;
  logout: () => void;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeBarcodeInput(value: string) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
}

function getDefaultUiProfile(tenantId?: string): UiProfile {
  if (tenantId?.includes('lanchonete')) {
    return {
      scannerModeLabel: 'Caixa Scanner',
      stockModeLabel: 'Leitura de Estoque',
      tableModeLabel: 'Comanda de Atendimento',
      serviceRoleLabel: 'Garcom',
      tableLabel: 'Mesa',
    };
  }

  return {
    scannerModeLabel: 'Leitura de Produtos',
    stockModeLabel: 'Leitura de Estoque',
    tableModeLabel: 'Pedido Assistido',
    serviceRoleLabel: 'Atendente',
    tableLabel: 'Comanda',
  };
}

function getDefaultModuleToggles(tenant?: TenantContext): ModuleToggles {
  if (tenant?.moduleCaps) {
    return { ...tenant.moduleCaps };
  }

  const t = tenant?.tenantId || '';
  const features: FeatureFlags | undefined = tenant?.features;

  if (t.includes('hortfruit') || t.includes('hortifruit') || t.includes('varejao')) {
    return {
      scanner: !!features?.scannerMode,
      stockFlow: !!features?.scannerMode,
      serviceFlow: false,
      tableField: false,
      kitchenRouting: false,
      tableClose: false,
      favorites: false,
      topSelling: false,
      history: !!features?.historyMode,
      manualCode: !!features?.manualCode,
    };
  }

  return {
    scanner: !!features?.scannerMode,
    stockFlow: !!features?.scannerMode,
    serviceFlow: !!features?.waiterMode,
    tableField: !!features?.waiterMode,
    kitchenRouting: !!features?.waiterMode,
    tableClose: !!features?.waiterMode,
    favorites: !!features?.waiterMode,
    topSelling: !!features?.waiterMode,
    history: !!features?.historyMode,
    manualCode: !!features?.manualCode,
  };
}

function applyTenantCaps(next: ModuleToggles, tenant?: TenantContext): ModuleToggles {
  const caps = tenant?.moduleCaps;
  if (!caps) return { ...next };

  const limited = { ...next };
  (Object.keys(limited) as Array<keyof ModuleToggles>).forEach((key) => {
    limited[key] = !!limited[key] && !!caps[key];
  });

  return limited;
}

function normalizeModuleToggles(next: ModuleToggles, tenant?: TenantContext): ModuleToggles {
  let normalized = { ...next };

  if (!tenant?.features.scannerMode) {
    normalized.scanner = false;
    normalized.stockFlow = false;
  }

  if (!tenant?.features.waiterMode) normalized.serviceFlow = false;
  if (!tenant?.features.historyMode) normalized.history = false;
  if (!tenant?.features.manualCode) normalized.manualCode = false;

  normalized = applyTenantCaps(normalized, tenant);

  if (!normalized.scanner) {
    normalized.manualCode = false;
    normalized.stockFlow = false;
  }

  if (!normalized.serviceFlow) {
    normalized.tableField = false;
    normalized.kitchenRouting = false;
    normalized.tableClose = false;
    normalized.favorites = false;
    normalized.topSelling = false;
  }

  normalized = applyTenantCaps(normalized, tenant);
  return normalized;
}

function targetLabel(target: DispatchTarget) {
  if (target === 'cashier') return 'Caixa';
  if (target === 'kitchen') return 'Cozinha';
  return 'Sistema';
}

function isDuplicateResult(result: { duplicate?: boolean; message?: string }) {
  return !!result.duplicate || result.message === 'already_processed';
}

function computeOpenTableTotal(tenantId: string, tableId: string) {
  const history = listHistory(tenantId);
  let ordersTotal = 0;
  let closedTotal = 0;

  for (const row of history) {
    if (row.status !== 'sent') continue;

    try {
      const payload = JSON.parse(row.payload) as OrderPayload;
      if (payload.tableId !== tableId) continue;
      if (payload.dispatchTarget !== 'cashier') continue;

      if (payload.eventType === 'table_close') {
        closedTotal += payload.payment?.total || payload.total || 0;
      } else {
        ordersTotal += payload.total || 0;
      }
    } catch {
      continue;
    }
  }

  return Math.max(0, ordersTotal - closedTotal);
}

const initialProfile = getDefaultUiProfile();
const initialToggles: ModuleToggles = {
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

export const useAppStore = create<AppState>((set, get) => ({
  operator: null,
  tenant: null,
  session: null,
  mode: 'scanner',
  uiProfile: initialProfile,
  moduleToggles: initialToggles,
  items: [],
  sending: false,
  forceOffline: false,
  pendingCount: 0,
  syncState: 'idle',
  lastSyncAt: null,

  logout: () =>
    set({
      operator: null,
      tenant: null,
      session: null,
      mode: 'scanner',
      uiProfile: initialProfile,
      moduleToggles: initialToggles,
      items: [],
      sending: false,
      forceOffline: false,
      pendingCount: 0,
      syncState: 'idle',
      lastSyncAt: null,
    }),

  setForceOffline: (value) => set({ forceOffline: value }),

  canUseMode: (mode) => {
    const tenant = get().tenant;
    const toggles = get().moduleToggles;
    if (!tenant || tenant.licenseStatus !== 'active') return false;

    if (mode === 'scanner') return !!tenant.features.scannerMode && toggles.scanner;
    if (mode === 'stock') return !!tenant.features.scannerMode && toggles.scanner && toggles.stockFlow;
    return !!tenant.features.waiterMode && toggles.serviceFlow;
  },

  canUseFeature: (feature) => {
    const tenant = get().tenant;
    const toggles = get().moduleToggles;
    if (!tenant || tenant.licenseStatus !== 'active') return false;

    const base = toggles[feature];
    if (!base) return false;

    if (feature === 'scanner' || feature === 'stockFlow') return tenant.features.scannerMode && (!!tenant.moduleCaps ? !!tenant.moduleCaps[feature] : true);
    if (feature === 'serviceFlow') return tenant.features.waiterMode && (!!tenant.moduleCaps ? !!tenant.moduleCaps.serviceFlow : true);
    if (feature === 'history') return tenant.features.historyMode && (!!tenant.moduleCaps ? !!tenant.moduleCaps.history : true);
    if (feature === 'manualCode') return tenant.features.manualCode && (!!tenant.moduleCaps ? !!tenant.moduleCaps.manualCode : true);

    if (tenant.moduleCaps && !tenant.moduleCaps[feature]) {
      return false;
    }

    if (['tableField', 'kitchenRouting', 'tableClose', 'favorites', 'topSelling'].includes(feature) && !toggles.serviceFlow) {
      return false;
    }

    return true;
  },

  login: async ({ tenantId, licenseKey, name, password, role }) => {
    const adapter = new MockPdvAdapter(get().forceOffline);
    const auth = await adapter.authenticate({ tenantId, licenseKey, username: name, password, role });

    const storedProfile = loadUiProfile(auth.tenant.tenantId);
    const defaultProfile = getDefaultUiProfile(auth.tenant.tenantId);
    const uiProfile = { ...defaultProfile, ...(storedProfile || {}) };
    if (!storedProfile || JSON.stringify(storedProfile) !== JSON.stringify(uiProfile)) {
      saveUiProfile(auth.tenant.tenantId, uiProfile);
    }

    const storedToggles = loadModuleToggles(auth.tenant.tenantId);
    const defaultToggles = getDefaultModuleToggles(auth.tenant);
    const moduleToggles = normalizeModuleToggles({ ...defaultToggles, ...(storedToggles || {}) }, auth.tenant);
    if (!storedToggles || JSON.stringify(storedToggles) !== JSON.stringify(moduleToggles)) {
      saveModuleToggles(auth.tenant.tenantId, moduleToggles);
    }

    const pending = getPendingCount(auth.tenant.tenantId);

    set({
      tenant: auth.tenant,
      operator: {
        id: auth.operatorId,
        name: auth.name,
        role,
        token: auth.token,
        tenantId: auth.tenant.tenantId,
      },
      uiProfile,
      moduleToggles,
      items: [],
      session: null,
      pendingCount: pending,
      syncState: pending > 0 ? 'offline' : 'idle',
      lastSyncAt: null,
    });
  },

  refreshPendingCount: () => {
    const tenantId = get().tenant?.tenantId;
    if (!tenantId) {
      set({ pendingCount: 0 });
      return;
    }

    const pending = getPendingCount(tenantId);
    set({ pendingCount: pending, syncState: pending > 0 ? 'offline' : get().syncState === 'error' ? 'error' : 'idle' });
  },

  setSession: (session) => set({ session }),

  setMode: (mode) => {
    if (get().canUseMode(mode)) {
      set({ mode, items: [] });
    }
  },

  setUiProfile: (profile) => {
    const tenantId = get().tenant?.tenantId;
    if (tenantId) {
      saveUiProfile(tenantId, profile);
    }
    set({ uiProfile: profile });
  },

  setModuleToggles: (toggles) => {
    const tenant = get().tenant;
    if (!tenant) return;

    const next = normalizeModuleToggles({ ...get().moduleToggles, ...toggles }, tenant);
    saveModuleToggles(tenant.tenantId, next);
    set({ moduleToggles: next });

    if (!next.serviceFlow && get().mode === 'table') {
      set({ mode: 'scanner', items: [] });
    }

    if (!next.stockFlow && get().mode === 'stock') {
      set({ mode: 'scanner', items: [] });
    }
  },

  addByProduct: (product) => {
    const now = new Date().toISOString();
    set((state) => {
      const found = state.items.find((item) => item.barcode === product.barcode);
      if (found) {
        return {
          items: state.items.map((item) =>
            item.barcode === product.barcode
              ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice, scannedAt: now }
              : item
          ),
        };
      }
      return {
        items: [...state.items, { ...product, quantity: 1, subtotal: product.unitPrice, scannedAt: now }],
      };
    });
  },

  addManualBarcode: async (barcode) => {
    const clean = normalizeBarcodeInput(barcode);
    if (!clean) return { ok: false, message: 'Informe um codigo valido.' };

    if (!get().canUseFeature('manualCode')) {
      return { ok: false, message: 'Codigo manual desativado para este cliente.' };
    }

    const tenantId = get().tenant?.tenantId;
    if (!tenantId) return { ok: false, message: 'Tenant nao selecionado.' };

    const adapter = new MockPdvAdapter(get().forceOffline);
    const product = await adapter.fetchProductByBarcode(tenantId, clean);
    if (!product) return { ok: false, message: 'Produto nao encontrado.' };
    get().addByProduct(product);
    return { ok: true };
  },

  updateQty: (barcode, delta) => {
    set((state) => ({
      items: state.items
        .map((item) => (item.barcode === barcode ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
        .map((item) => ({ ...item, subtotal: item.quantity * item.unitPrice })),
    }));
  },

  removeItem: (barcode) => set((state) => ({ items: state.items.filter((item) => item.barcode !== barcode) })),
  clearItems: () => set({ items: [] }),
  total: () => get().items.reduce((acc, item) => acc + item.subtotal, 0),

  sendCurrentOrder: async () => {
    const state = get();
    if (!state.operator || !state.session || !state.tenant) return { ok: false, message: 'Sessao nao iniciada.' };
    if (state.tenant.licenseStatus !== 'active') return { ok: false, message: 'Licenca expirada.' };
    if (state.mode === 'scanner' && !state.canUseFeature('scanner')) return { ok: false, message: 'Scanner desativado para este cliente.' };
    if (state.mode === 'stock' && !state.canUseFeature('stockFlow')) return { ok: false, message: 'Modo de estoque desativado para este cliente.' };
    if (state.mode === 'table' && !state.canUseFeature('serviceFlow')) return { ok: false, message: 'Comanda desativada para este cliente.' };
    if (state.mode === 'table' && state.canUseFeature('tableField') && !state.session.tableId) {
      return { ok: false, message: 'Informe a mesa/comanda antes do envio.' };
    }
    if (!state.items.length) return { ok: false, message: 'Sem itens para enviar.' };

    const baseId = uid();
    const dispatchTargets: DispatchTarget[] =
      state.mode === 'table'
        ? ['cashier', ...(state.canUseFeature('kitchenRouting') && state.session.enableKitchenProduction ? (['kitchen'] as DispatchTarget[]) : [])]
        : state.mode === 'stock'
          ? ['system']
          : ['cashier'];

    const payloads: OrderPayload[] = dispatchTargets.map((target, index) => ({
      tenantId: state.tenant!.tenantId,
      clientOrderId: `${baseId}-${target}-${index + 1}`,
      operatorId: state.operator!.id,
      storeId: state.session!.storeId,
      sessionId: state.session!.sessionId,
      orderType: state.mode,
      eventType: state.mode === 'stock' ? 'stock_count' : 'order',
      tableId: state.mode === 'table' && state.canUseFeature('tableField') ? state.session!.tableId : undefined,
      dispatchTarget: target,
      items: state.items.map((item) => ({
        barcode: item.barcode,
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
      total: state.total(),
      createdAt: new Date().toISOString(),
    }));

    set({ sending: true });
    try {
      const adapter = new MockPdvAdapter(state.forceOffline);
      const results: Array<{ payload: OrderPayload; success: boolean; externalId?: string; duplicate?: boolean }> = [];

      for (const payload of payloads) {
        try {
          const result = await adapter.sendOrder(payload);
          results.push({ payload, success: result.success, externalId: result.externalId, duplicate: isDuplicateResult(result) });
        } catch {
          results.push({ payload, success: false });
        }
      }

      const sentTargets: DispatchTarget[] = [];
      const duplicateTargets: DispatchTarget[] = [];
      const pendingTargets: DispatchTarget[] = [];

      for (const row of results) {
        const target = row.payload.dispatchTarget || 'system';
        if (row.success) {
          saveHistory(state.tenant.tenantId, state.mode, row.payload, 'sent', row.externalId);
          if (row.duplicate) {
            duplicateTargets.push(target);
          } else {
            sentTargets.push(target);
          }
        } else {
          enqueuePayload(state.tenant.tenantId, row.payload);
          saveHistory(state.tenant.tenantId, state.mode, row.payload, 'pending');
          pendingTargets.push(target);
        }
      }

      const pending = getPendingCount(state.tenant.tenantId);
      set({ items: [], pendingCount: pending, syncState: pending > 0 ? 'offline' : 'idle' });

      if (!pendingTargets.length) {
        if (state.mode === 'stock') {
          if (duplicateTargets.length && !sentTargets.length) {
            return { ok: true, message: 'Registro de estoque ja constava no sistema.' };
          }
          if (sentTargets.length && duplicateTargets.length) {
            return { ok: true, message: 'Estoque enviado. Parte ja estava registrada.' };
          }
          return { ok: true, message: 'Registro de estoque enviado ao sistema.' };
        }

        if (state.mode === 'table' && sentTargets.includes('cashier') && sentTargets.includes('kitchen')) {
          return { ok: true, message: 'Comanda enviada para Caixa e Cozinha.' };
        }

        if (duplicateTargets.length && !sentTargets.length) {
          return { ok: true, message: 'Pedido ja registrado anteriormente.' };
        }

        if (sentTargets.length && duplicateTargets.length) {
          return { ok: true, message: `Pedido enviado para ${sentTargets.map(targetLabel).join(' e ')} (parte ja registrada).` };
        }

        return { ok: true, message: `Pedido enviado para ${sentTargets.map(targetLabel).join(' e ')}.` };
      }

      if (!sentTargets.length && !duplicateTargets.length) {
        return { ok: true, offlineQueued: true, message: 'API offline. Pedido salvo para sincronizar.' };
      }

      const okTargets = [...sentTargets, ...duplicateTargets];
      return {
        ok: true,
        offlineQueued: true,
        message: `Parcial: confirmado em ${okTargets.map(targetLabel).join(' e ')}; pendente em ${pendingTargets.map(targetLabel).join(' e ')}.`,
      };
    } catch {
      for (const payload of payloads) {
        enqueuePayload(state.tenant.tenantId, payload);
        saveHistory(state.tenant.tenantId, state.mode, payload, 'pending');
      }
      const pending = getPendingCount(state.tenant.tenantId);
      set({ items: [], pendingCount: pending, syncState: 'offline' });
      return { ok: true, offlineQueued: true, message: 'Falha de envio. Pedido salvo localmente.' };
    } finally {
      set({ sending: false });
    }
  },

  closeTable: async ({ subtotal, discount, serviceFee, method }) => {
    const state = get();
    if (!state.operator || !state.session || !state.tenant) return { ok: false, message: 'Sessao nao iniciada.' };
    if (!state.canUseFeature('tableClose')) return { ok: false, message: 'Fechamento de mesa desativado para este cliente.' };

    const tableRef = state.canUseFeature('tableField') ? state.session.tableId : 'geral';
    if (state.canUseFeature('tableField') && !tableRef) return { ok: false, message: 'Informe a mesa para fechar.' };

    const openTotal = computeOpenTableTotal(state.tenant.tenantId, tableRef || 'geral');
    const baseSubtotal = subtotal > 0 ? subtotal : openTotal;
    const finalTotal = Math.max(0, baseSubtotal - Math.max(0, discount) + Math.max(0, serviceFee));

    const payload: OrderPayload = {
      tenantId: state.tenant.tenantId,
      clientOrderId: `${uid()}-close`,
      operatorId: state.operator.id,
      storeId: state.session.storeId,
      sessionId: state.session.sessionId,
      orderType: 'table',
      eventType: 'table_close',
      tableId: tableRef,
      dispatchTarget: 'cashier',
      payment: {
        method,
        subtotal: baseSubtotal,
        discount: Math.max(0, discount),
        serviceFee: Math.max(0, serviceFee),
        total: finalTotal,
        paidAt: new Date().toISOString(),
      },
      items: [
        {
          barcode: '9999999999999',
          productId: 'table-close',
          name: `Fechamento ${tableRef || 'geral'}`,
          unitPrice: finalTotal,
          quantity: 1,
          subtotal: finalTotal,
        },
      ],
      total: finalTotal,
      createdAt: new Date().toISOString(),
    };

    set({ sending: true });
    try {
      const adapter = new MockPdvAdapter(state.forceOffline);
      const result = await adapter.sendOrder(payload);
      if (result.success) {
        saveHistory(state.tenant.tenantId, 'table', payload, 'sent', result.externalId);
        const pending = getPendingCount(state.tenant.tenantId);
        set({
          session: state.canUseFeature('tableField') ? { ...state.session, tableId: undefined } : state.session,
          items: [],
          pendingCount: pending,
          syncState: pending > 0 ? 'offline' : 'idle',
        });

        if (isDuplicateResult(result)) {
          return { ok: true, message: 'Fechamento ja estava registrado no caixa.' };
        }

        return { ok: true, message: `Mesa fechada com sucesso. Total: R$ ${finalTotal.toFixed(2)}.` };
      }

      enqueuePayload(state.tenant.tenantId, payload);
      saveHistory(state.tenant.tenantId, 'table', payload, 'pending');
      const pending = getPendingCount(state.tenant.tenantId);
      set({ pendingCount: pending, syncState: 'offline' });
      return { ok: true, offlineQueued: true, message: 'API offline. Fechamento salvo para sincronizar.' };
    } catch {
      enqueuePayload(state.tenant.tenantId, payload);
      saveHistory(state.tenant.tenantId, 'table', payload, 'pending');
      const pending = getPendingCount(state.tenant.tenantId);
      set({ pendingCount: pending, syncState: 'offline' });
      return { ok: true, offlineQueued: true, message: 'Falha de envio. Fechamento salvo localmente.' };
    } finally {
      set({ sending: false });
    }
  },

  syncPending: async () => {
    const tenantId = get().tenant?.tenantId;
    if (!tenantId) return { synced: 0, duplicates: 0, failed: 0 };

    const queue = listQueue(tenantId);
    if (!queue.length) {
      set({ pendingCount: 0, syncState: 'idle' });
      return { synced: 0, duplicates: 0, failed: 0 };
    }

    set({ syncState: 'syncing' });
    const adapter = new MockPdvAdapter(get().forceOffline);
    let synced = 0;
    let duplicates = 0;
    let failed = 0;

    for (const row of queue) {
      try {
        const payload: OrderPayload = JSON.parse(row.payload);

        const alreadyDone = await adapter.findProcessedAction(tenantId, payload.clientOrderId);
        if (alreadyDone) {
          saveHistory(tenantId, payload.orderType, payload, 'sent', alreadyDone.externalId);
          removeFromQueue(row.id);
          duplicates += 1;
          continue;
        }

        const result = await adapter.sendOrder(payload);
        if (result.success) {
          saveHistory(tenantId, payload.orderType, payload, 'sent', result.externalId);
          removeFromQueue(row.id);
          if (isDuplicateResult(result)) {
            duplicates += 1;
          } else {
            synced += 1;
          }
        } else {
          incrementAttempts(row.id);
          failed += 1;
        }
      } catch {
        incrementAttempts(row.id);
        failed += 1;
      }
    }

    const pending = getPendingCount(tenantId);
    set({
      pendingCount: pending,
      syncState: pending > 0 ? 'offline' : 'idle',
      lastSyncAt: new Date().toISOString(),
    });

    return { synced, duplicates, failed };
  },
}));



