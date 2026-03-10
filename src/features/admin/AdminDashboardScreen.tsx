import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { AdminTenantConfig, IntegrationAuthType, IntegrationConfig, IntegrationEnvironment, ModuleToggles } from '../../core/types/models';
import { defaultIntegrationConfig, listAdminTenantConfigs, saveAdminTenantConfig } from '../../data/storage/localDb';

const MODULES: Array<{ key: keyof ModuleToggles; label: string }> = [
  { key: 'scanner', label: 'Scanner' },
  { key: 'stockFlow', label: 'Estoque' },
  { key: 'manualCode', label: 'Codigo manual' },
  { key: 'serviceFlow', label: 'Comanda' },
  { key: 'tableField', label: 'Mesa/Comanda ID' },
  { key: 'kitchenRouting', label: 'Cozinha' },
  { key: 'tableClose', label: 'Fechamento' },
  { key: 'favorites', label: 'Favoritos' },
  { key: 'topSelling', label: 'Mais vendidos' },
  { key: 'history', label: 'Historico' },
];

const AUTH_OPTIONS: Array<{ id: IntegrationAuthType; label: string }> = [
  { id: 'none', label: 'Sem auth' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'api_key', label: 'API Key' },
];

const ENV_OPTIONS: Array<{ id: IntegrationEnvironment; label: string }> = [
  { id: 'production', label: 'Producao' },
  { id: 'sandbox', label: 'Sandbox' },
];

const VAREJAO_BASE_URL = 'https://varejao-backend-1.onrender.com';
const VAREJAO_PRODUCT_FALLBACK_ID = 'p001';

type WizardStepId = 'tenant' | 'modules' | 'integration';
type SetupStep = { id: WizardStepId; label: string; done: boolean };
type StepIssues = Record<WizardStepId, string[]>;
type ConnectionCheck = { id: string; label: string; kind: 'ok' | 'warn' | 'error' | 'info'; text: string; durationMs: number };
type BusinessPreset = {
  id: string;
  label: string;
  description: string;
  caps: ModuleToggles;
};

const WIZARD_ORDER: WizardStepId[] = ['tenant', 'modules', 'integration'];

function buildCaps(overrides: Partial<ModuleToggles>): ModuleToggles {
  return {
    scanner: false,
    stockFlow: false,
    serviceFlow: false,
    tableField: false,
    kitchenRouting: false,
    tableClose: false,
    favorites: false,
    topSelling: false,
    history: false,
    manualCode: false,
    ...overrides,
  };
}

const BUSINESS_PRESETS: BusinessPreset[] = [
  {
    id: 'mercado',
    label: 'Mercado / Hortfruti',
    description: 'Foco em scanner e estoque, sem fluxo de mesa/comanda.',
    caps: buildCaps({
      scanner: true,
      stockFlow: true,
      manualCode: true,
      topSelling: true,
      history: true,
    }),
  },
  {
    id: 'lanchonete',
    label: 'Lanchonete / Bar',
    description: 'Comanda completa: mesa, cozinha, fechamento e metricas.',
    caps: buildCaps({
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
    }),
  },
  {
    id: 'balcao',
    label: 'Balcao rapido',
    description: 'Atendimento direto no caixa, sem mesa.',
    caps: buildCaps({
      scanner: true,
      stockFlow: true,
      serviceFlow: true,
      kitchenRouting: true,
      tableClose: true,
      topSelling: true,
      history: true,
      manualCode: true,
    }),
  },
];

function fullCaps(): ModuleToggles {
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

function emptyTenant(): AdminTenantConfig {
  return {
    tenantId: '',
    tenantName: '',
    licenseKey: '',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
    moduleCaps: fullCaps(),
    integrationConfig: defaultIntegrationConfig(),
  };
}

function normalizeBaseUrl(url: string) {
  const clean = url.trim();
  if (!clean) return '';
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

function joinUrl(base: string, path: string) {
  const b = normalizeBaseUrl(base);
  const p = (path || '').trim();
  if (!b) return '';
  if (!p) return b;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return p.startsWith('/') ? `${b}${p}` : `${b}/${p}`;
}

function getActiveBaseUrl(cfg: IntegrationConfig) {
  const preferred = cfg.environment === 'sandbox' ? cfg.sandboxBaseUrl : cfg.productionBaseUrl;
  return normalizeBaseUrl(preferred || cfg.baseUrl);
}

function applyEndpointTokens(path: string, values: Record<string, string>) {
  let result = path || '';
  for (const [key, value] of Object.entries(values)) {
    const token = '{' + key + '}';
    result = result.split(token).join(encodeURIComponent(value));
  }
  return result;
}

function slugifyTenant(input: string) {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  return base || 'empresa';
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidIsoDateTime(value: string) {
  const clean = value.trim();
  if (!clean) return false;
  if (!ISO_DATE_REGEX.test(clean)) return false;
  return !Number.isNaN(new Date(clean).getTime());
}

function isValidHttpUrl(value: string) {
  const clean = value.trim();
  if (!clean) return false;

  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatIsoFromDigits(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (!digits) return '';

  let out = digits.slice(0, 4);
  if (digits.length > 4) out += '-' + digits.slice(4, 6);
  if (digits.length > 6) out += '-' + digits.slice(6, 8);
  if (digits.length > 8) out += 'T' + digits.slice(8, 10);
  if (digits.length > 10) out += ':' + digits.slice(10, 12);
  if (digits.length > 12) out += ':' + digits.slice(12, 14);
  if (digits.length === 14) out += 'Z';

  return out;
}

function applyIsoInputMask(value: string) {
  const clean = value.replace(/\s+/g, '');
  if (!clean) return '';

  const hasDelimiters = /[-TtZz:+]/.test(clean);
  if (hasDelimiters) {
    return clean.replace(/t/g, 'T').replace(/z/g, 'Z');
  }

  return formatIsoFromDigits(clean);
}

function toIsoSeconds(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function addDurationToIso(value: string, options: { days?: number; years?: number }) {
  const clean = value.trim();
  const base = isValidIsoDateTime(clean) ? new Date(clean) : new Date();
  const next = new Date(base.getTime());

  if (options.days) {
    next.setUTCDate(next.getUTCDate() + options.days);
  }

  if (options.years) {
    next.setUTCFullYear(next.getUTCFullYear() + options.years);
  }

  return toIsoSeconds(next);
}

function buildHeaders(cfg: IntegrationConfig) {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (cfg.authType === 'bearer' && cfg.bearerToken?.trim()) {
    headers.Authorization = `Bearer ${cfg.bearerToken.trim()}`;
  }

  if (cfg.authType === 'api_key' && cfg.apiKey?.trim()) {
    headers[(cfg.apiKeyHeader || 'x-api-key').trim() || 'x-api-key'] = cfg.apiKey.trim();
  }

  return headers;
}

export function AdminDashboardScreen() {
  const operator = useAppStore((s) => s.operator);
  const isAdmin = operator?.role === 'admin';

  const [tenants, setTenants] = useState<AdminTenantConfig[]>([]);
  const [editing, setEditing] = useState<AdminTenantConfig>(emptyTenant());
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [wizardMode, setWizardMode] = useState(true);
  const [activeStepId, setActiveStepId] = useState<WizardStepId>('tenant');
  const [message, setMessage] = useState('');
  const [testStatus, setTestStatus] = useState<{ kind: 'ok' | 'warn' | 'error' | 'info'; text: string } | null>(null);
  const [connectionChecks, setConnectionChecks] = useState<ConnectionCheck[]>([]);
  const [testBarcode, setTestBarcode] = useState('7891000000011');
  const [showBearerToken, setShowBearerToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const load = () => {
    const list = listAdminTenantConfigs();
    setTenants(list);

    if (!selectedTenantId && list.length > 0) {
      setSelectedTenantId(list[0].tenantId);
      setEditing(list[0]);
      return;
    }

    if (selectedTenantId) {
      const selected = list.find((item) => item.tenantId === selectedTenantId);
      if (selected) setEditing(selected);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [selectedTenantId])
  );

  const moduleEnabledCount = useMemo(() => Object.values(editing.moduleCaps).filter(Boolean).length, [editing.moduleCaps]);

  const isExpiresAtValid = useMemo(() => {
    const value = editing.expiresAt.trim();
    if (!value) return false;
    return isValidIsoDateTime(value);
  }, [editing.expiresAt]);

  const activeBaseUrl = useMemo(() => getActiveBaseUrl(editing.integrationConfig), [editing.integrationConfig]);

  const isBaseUrlValid = useMemo(() => {
    if (!activeBaseUrl) return false;
    return isValidHttpUrl(activeBaseUrl);
  }, [activeBaseUrl]);

  const stepIssues = useMemo<StepIssues>(() => {
    const tenant: string[] = [];
    if (!editing.tenantId.trim()) tenant.push('Preencha o tenant_id.');
    if (!editing.tenantName.trim()) tenant.push('Informe o nome da empresa.');
    if (!editing.licenseKey.trim()) tenant.push('Informe a chave da licenca.');
    if (!editing.expiresAt.trim()) tenant.push('Defina a expiracao da licenca.');
    else if (!isExpiresAtValid) tenant.push('Data de expiracao invalida (use ISO, ex: 2026-12-31T23:59:59Z).');

    const modules: string[] = [];
    if (moduleEnabledCount === 0) modules.push('Ative pelo menos 1 modulo.');

    const integration: string[] = [];
    const cfg = editing.integrationConfig;
    if (cfg.enabled) {
      if (!activeBaseUrl) integration.push('Informe a Base URL do ambiente ativo.');
      else if (!isBaseUrlValid) integration.push('Base URL invalida (use http:// ou https://).');
      if (!cfg.endpoints.fetchProduct.trim()) integration.push('Configure endpoint de busca de produto.');
      if (!cfg.endpoints.sendOrder.trim()) integration.push('Configure endpoint de envio de pedido.');
      if (cfg.authType === 'bearer' && !cfg.bearerToken?.trim()) {
        integration.push('Informe o Bearer token.');
      }
      if (cfg.authType === 'api_key') {
        if (!(cfg.apiKeyHeader || '').trim()) integration.push('Informe o header da API key.');
        if (!cfg.apiKey?.trim()) integration.push('Informe o valor da API key.');
      }
    }

    return { tenant, modules, integration };
  }, [activeBaseUrl, editing.expiresAt, editing.integrationConfig, editing.licenseKey, editing.tenantId, editing.tenantName, isBaseUrlValid, isExpiresAtValid, moduleEnabledCount]);

  const setupSteps = useMemo<SetupStep[]>(() => {
    return [
      { id: 'tenant', label: 'Dados da empresa', done: stepIssues.tenant.length === 0 },
      { id: 'modules', label: 'Liberacao de modulos', done: stepIssues.modules.length === 0 },
      { id: 'integration', label: 'Integracao SaaS', done: stepIssues.integration.length === 0 },
    ];
  }, [stepIssues]);

  const setupDoneCount = useMemo(() => setupSteps.filter((step) => step.done).length, [setupSteps]);

  const canSave = useMemo(() => {
    if (!isAdmin) return false;
    return WIZARD_ORDER.every((stepId) => stepIssues[stepId].length === 0);
  }, [isAdmin, stepIssues]);

  const selectedPreset = useMemo(() => BUSINESS_PRESETS.find((item) => item.id === selectedPresetId) || null, [selectedPresetId]);

  const activeStepIndex = useMemo(() => WIZARD_ORDER.indexOf(activeStepId), [activeStepId]);

  const activeStep = useMemo(() => {
    const found = setupSteps.find((item) => item.id === activeStepId);
    return found || setupSteps[0];
  }, [activeStepId, setupSteps]);

  const canGoPrev = wizardMode && activeStepIndex > 0;
  const activeStepIssues = stepIssues[activeStepId] || [];
  const canGoNext = wizardMode && activeStepIndex >= 0 && activeStepIndex < WIZARD_ORDER.length - 1 && activeStepIssues.length === 0;

  const resolvedUrls = useMemo(() => {
    const cfg = editing.integrationConfig;
    const base = getActiveBaseUrl(cfg);
    return {
      health: joinUrl(base, cfg.endpoints.health),
      fetchProduct: joinUrl(base, cfg.endpoints.fetchProduct),
      sendOrder: joinUrl(base, cfg.endpoints.sendOrder),
      orderStatus: joinUrl(base, cfg.endpoints.orderStatus),
      authenticate: joinUrl(base, cfg.endpoints.authenticate),
    };
  }, [editing.integrationConfig]);

  const selectTenant = (tenantId: string) => {
    const tenant = tenants.find((item) => item.tenantId === tenantId);
    if (!tenant) return;

    setSelectedTenantId(tenantId);
    setSelectedPresetId('');
    setActiveStepId('tenant');
    setEditing(tenant);
    setMessage('');
    setTestStatus(null);
    setConnectionChecks([]);
  };

  const toggleModule = (key: keyof ModuleToggles) => {
    if (!isAdmin) return;
    setSelectedPresetId('');
    setEditing((prev) => ({
      ...prev,
      moduleCaps: { ...prev.moduleCaps, [key]: !prev.moduleCaps[key] },
    }));
  };

  const applyBusinessPreset = (presetId: string) => {
    if (!isAdmin) return;

    const preset = BUSINESS_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    setSelectedPresetId(presetId);
    setActiveStepId('modules');
    setEditing((prev) => ({
      ...prev,
      moduleCaps: { ...preset.caps },
    }));
    setMessage(`Preset aplicado: ${preset.label}.`);
  };

  const suggestCompanyData = () => {
    if (!isAdmin) return;

    const baseSource = editing.tenantId.trim() || editing.tenantName.trim() || 'empresa';
    const slug = slugifyTenant(baseSource);
    const randomCode = Math.floor(1000 + Math.random() * 9000);

    setEditing((prev) => ({
      ...prev,
      tenantId: prev.tenantId.trim() || slug,
      licenseKey: prev.licenseKey.trim() || `${slug.slice(0, 6).toUpperCase()}-${randomCode}`,
      expiresAt: prev.expiresAt.trim() || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
    }));

    setMessage('Sugestao aplicada para tenant e licenca.');
  };

  const handleExpiresAtChange = (value: string) => {
    const masked = applyIsoInputMask(value);
    setEditing((prev) => ({ ...prev, expiresAt: masked }));
  };

  const quickAddExpiresAtDays = (days: number) => {
    if (!isAdmin) return;
    setEditing((prev) => ({
      ...prev,
      expiresAt: addDurationToIso(prev.expiresAt, { days }),
    }));
  };

  const quickAddExpiresAtYears = (years: number) => {
    if (!isAdmin) return;
    setEditing((prev) => ({
      ...prev,
      expiresAt: addDurationToIso(prev.expiresAt, { years }),
    }));
  };

  const goToStep = (stepId: WizardStepId) => {
    setActiveStepId(stepId);
  };

  const goPrevStep = () => {
    if (!canGoPrev) return;
    const nextIndex = Math.max(0, activeStepIndex - 1);
    setActiveStepId(WIZARD_ORDER[nextIndex]);
  };

  const goNextStep = () => {
    if (!canGoNext) return;
    const nextIndex = Math.min(WIZARD_ORDER.length - 1, activeStepIndex + 1);
    setActiveStepId(WIZARD_ORDER[nextIndex]);
  };

  const updateIntegration = (partial: Omit<Partial<IntegrationConfig>, 'endpoints'>) => {
    setEditing((prev) => ({
      ...prev,
      integrationConfig: {
        ...prev.integrationConfig,
        ...partial,
      },
    }));
  };

  const updateEnvironment = (environment: IntegrationEnvironment) => {
    if (!isAdmin) return;
    setEditing((prev) => ({
      ...prev,
      integrationConfig: {
        ...prev.integrationConfig,
        environment,
      },
    }));
  };

  const copySecret = async (value: string, label: string) => {
    const clean = value.trim();
    if (!clean) {
      setMessage(label + ' vazio.');
      return;
    }

    try {
      await Clipboard.setStringAsync(clean);
      setMessage(label + ' copiado.');
    } catch {
      setMessage('Falha ao copiar ' + label.toLowerCase() + '.');
    }
  };

  const copyConnectionSummary = async () => {
    if (!testStatus && connectionChecks.length === 0) {
      setMessage('Execute o teste tecnico antes de copiar o resumo.');
      return;
    }

    const environmentLabel = editing.integrationConfig.environment === 'sandbox' ? 'Sandbox' : 'Producao';
    const lines: string[] = [];
    lines.push('Resumo tecnico de integracao');
    lines.push('Cliente: ' + (editing.tenantName.trim() || editing.tenantId.trim() || '-'));
    lines.push('Ambiente: ' + environmentLabel);
    lines.push('URL ativa: ' + (activeBaseUrl || '-'));
    lines.push('Codigo de barras teste: ' + (testBarcode.trim() || '-'));

    if (testStatus) {
      lines.push('Resumo: ' + testStatus.text);
    }

    if (connectionChecks.length > 0) {
      lines.push('Detalhes:');
      for (const check of connectionChecks) {
        lines.push('- ' + check.label + ': ' + check.kind.toUpperCase() + ' | ' + check.durationMs + ' ms | ' + check.text);
      }
    }

    try {
      await Clipboard.setStringAsync(lines.join('\n'));
      setMessage('Resumo tecnico copiado.');
    } catch {
      setMessage('Falha ao copiar resumo tecnico.');
    }
  };

  const updateEndpoint = (key: keyof IntegrationConfig['endpoints'], value: string) => {
    setEditing((prev) => ({
      ...prev,
      integrationConfig: {
        ...prev.integrationConfig,
        endpoints: {
          ...prev.integrationConfig.endpoints,
          [key]: value,
        },
      },
    }));
  };

  const fillRestTemplate = () => {
    if (!isAdmin) return;
    const template = defaultIntegrationConfig().endpoints;
    setEditing((prev) => ({
      ...prev,
      integrationConfig: {
        ...prev.integrationConfig,
        providerName: prev.integrationConfig.providerName || 'REST Padrao',
        endpoints: { ...template },
      },
    }));
    setTestStatus({ kind: 'info', text: 'Template REST padrao aplicado nos endpoints.' });
    setConnectionChecks([]);
  };

  const fillVarejaoTemplate = () => {
    if (!isAdmin) return;

    setEditing((prev) => ({
      ...prev,
      integrationConfig: {
        ...prev.integrationConfig,
        enabled: true,
        providerName: 'Varejao do Povo API',
        authType: 'none',
        environment: 'production',
        productionBaseUrl: VAREJAO_BASE_URL,
        baseUrl: VAREJAO_BASE_URL,
        endpoints: {
          ...prev.integrationConfig.endpoints,
          health: '/produtos',
          fetchProduct: '/produtos',
          sendOrder: '/carrinho',
          orderStatus: '/checkout',
          authenticate: '/auth/login',
        },
      },
    }));

    setTestBarcode(VAREJAO_PRODUCT_FALLBACK_ID);
    setTestStatus({ kind: 'info', text: 'Template Varejao aplicado. Use p001, p002... para teste de produto.' });
    setConnectionChecks([]);
  };

  const runConnectionTest = async (configOverride?: IntegrationConfig) => {
    if (!isAdmin) return;

    setConnectionChecks([]);

    const cfg = configOverride || editing.integrationConfig;
    if (!cfg.enabled) {
      setTestStatus({ kind: 'info', text: 'Integracao esta desativada para esta empresa.' });
      return;
    }

    const baseUrl = getActiveBaseUrl(cfg);
    if (!baseUrl) {
      setTestStatus({ kind: 'warn', text: 'Informe a Base URL do ambiente ativo para testar.' });
      return;
    }

    if (!isValidHttpUrl(baseUrl)) {
      setTestStatus({ kind: 'warn', text: 'Base URL invalida. Use http:// ou https://.' });
      return;
    }

    const timeoutMs = Math.max(1000, Number(cfg.timeoutMs || 10000));
    const headers = buildHeaders(cfg);
    const checks: ConnectionCheck[] = [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const runFetchCheck = async (args: {
      id: string;
      label: string;
      url: string;
      init?: RequestInit;
      parseHint?: 'health' | 'product' | 'order';
    }) => {
      const startedAt = Date.now();
      const reqInit: RequestInit = {
        method: 'GET',
        headers,
        signal: controller.signal,
        ...(args.init || {}),
      };

      try {
        const res = await fetch(args.url, reqInit);
        const durationMs = Date.now() - startedAt;

        let textInfo = 'Status ' + res.status;
        if (args.parseHint === 'product' && res.ok) {
          try {
            const body = await res.clone().json();
            const payload: any = body && typeof body === 'object' && 'data' in body ? (body as any).data : body;
            const productList: any[] | null = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.items)
                ? payload.items
                : null;
            const product: any = productList ? productList[0] : payload?.product || payload;
            const productName = String(product?.name || product?.nome || '').trim();
            if (productName) {
              textInfo += ' | Produto: ' + productName;
            }
          } catch {
            // resposta sem JSON valido
          }
        }

        if (args.parseHint === 'order' && res.status === 409) {
          checks.push({
            id: args.id,
            label: args.label,
            kind: 'warn',
            text: 'Pedido de teste retornou 409 (duplicado/processado).',
            durationMs,
          });
          return;
        }

        checks.push({
          id: args.id,
          label: args.label,
          kind: res.ok ? 'ok' : 'warn',
          text: textInfo,
          durationMs,
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const msg = error instanceof Error ? error.message : 'Falha de rede';
        checks.push({
          id: args.id,
          label: args.label,
          kind: 'error',
          text: msg,
          durationMs,
        });
      }
    };

    setTestStatus({ kind: 'info', text: 'Executando testes tecnicos...' });

    try {
      const healthUrl = joinUrl(baseUrl, cfg.endpoints.health || '/health');
      if (healthUrl) {
        await runFetchCheck({ id: 'health', label: 'Health check', url: healthUrl, parseHint: 'health' });
      } else {
        checks.push({ id: 'health', label: 'Health check', kind: 'warn', text: 'Endpoint health invalido.', durationMs: 0 });
      }

      const barcodeValue = testBarcode.trim() || '7891000000011';
      const productPath = applyEndpointTokens(cfg.endpoints.fetchProduct || '', { barcode: barcodeValue });
      const productUrl = joinUrl(baseUrl, productPath);
      if (productUrl) {
        await runFetchCheck({ id: 'product', label: 'Buscar produto', url: productUrl, parseHint: 'product' });
      } else {
        checks.push({ id: 'product', label: 'Buscar produto', kind: 'warn', text: 'Endpoint de produto invalido.', durationMs: 0 });
      }

      const clientOrderId = 'test-' + Date.now();
      const sendPath = applyEndpointTokens(cfg.endpoints.sendOrder || '', { clientOrderId: clientOrderId });
      const sendUrl = joinUrl(baseUrl, sendPath);
      if (sendUrl) {
        const normalizedSendPath = (sendPath || '').toLowerCase();
        const isCartEndpoint = normalizedSendPath.includes('/carrinho');

        const orderPayload = isCartEndpoint
          ? {
              produtoId: barcodeValue || VAREJAO_PRODUCT_FALLBACK_ID,
              quantidade: 1,
            }
          : {
              tenantId: editing.tenantId.trim().toLowerCase() || 'tenant_teste',
              clientOrderId: clientOrderId,
              operatorId: operator?.id || 'admin-teste',
              storeId: '1',
              sessionId: 'sessao-teste',
              orderType: 'scanner',
              items: [
                {
                  barcode: barcodeValue,
                  productId: 'produto-teste',
                  name: 'Produto Teste',
                  unitPrice: 1,
                  quantity: 1,
                  subtotal: 1,
                },
              ],
              total: 1,
              createdAt: new Date().toISOString(),
            };

        await runFetchCheck({
          id: 'order',
          label: isCartEndpoint ? 'Adicionar item teste' : 'Enviar pedido teste',
          url: sendUrl,
          parseHint: 'order',
          init: {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              ...(isCartEndpoint ? { 'x-cart-id': clientOrderId } : {}),
            },
            body: JSON.stringify(orderPayload),
          },
        });
      } else {
        checks.push({ id: 'order', label: 'Enviar pedido teste', kind: 'warn', text: 'Endpoint de envio invalido.', durationMs: 0 });
      }
    } finally {
      clearTimeout(timer);
    }

    setConnectionChecks(checks);

    const okCount = checks.filter((item) => item.kind === 'ok').length;
    const warnCount = checks.filter((item) => item.kind === 'warn').length;
    const errorCount = checks.filter((item) => item.kind === 'error').length;

    const summaryKind = errorCount > 0 ? 'error' : warnCount > 0 ? 'warn' : 'ok';
    setTestStatus({
      kind: summaryKind,
      text:
        'Teste tecnico (' + (cfg.environment === 'sandbox' ? 'Sandbox' : 'Producao') + '): ' + okCount + ' ok, ' + warnCount + ' aviso, ' + errorCount + ' erro.',
    });
  };

  const buildPayload = (): AdminTenantConfig => ({
    tenantId: editing.tenantId.trim().toLowerCase(),
    tenantName: editing.tenantName.trim(),
    licenseKey: editing.licenseKey.trim().toUpperCase(),
    expiresAt: editing.expiresAt.trim(),
    moduleCaps: editing.moduleCaps,
    integrationConfig: {
      ...editing.integrationConfig,
      providerName: editing.integrationConfig.providerName.trim() || 'REST Padrao',
      environment: editing.integrationConfig.environment || 'production',
      productionBaseUrl: normalizeBaseUrl(editing.integrationConfig.productionBaseUrl || editing.integrationConfig.baseUrl),
      sandboxBaseUrl: normalizeBaseUrl(editing.integrationConfig.sandboxBaseUrl),
      baseUrl: normalizeBaseUrl(editing.integrationConfig.baseUrl || editing.integrationConfig.productionBaseUrl),
      timeoutMs: Math.max(1000, Number(editing.integrationConfig.timeoutMs || 10000)),
      apiKeyHeader: editing.integrationConfig.apiKeyHeader?.trim() || 'x-api-key',
    },
  });

  const persistPayload = (payload: AdminTenantConfig) => {
    saveAdminTenantConfig(payload);
    setMessage('Cadastro da empresa salvo. Modulos e integracao atualizados.');
    const list = listAdminTenantConfigs();
    setTenants(list);
    setSelectedTenantId(payload.tenantId);
    setEditing(payload);
  };

  const save = () => {
    if (!canSave) return;
    const payload = buildPayload();
    persistPayload(payload);
  };

  const saveAndTest = async () => {
    if (!canSave) return;
    const payload = buildPayload();
    persistPayload(payload);
    await runConnectionTest(payload.integrationConfig);
  };

  const showSaveActions = !wizardMode || activeStepId === 'integration';

  const firstBlockingIssue = useMemo(() => {
    for (const stepId of WIZARD_ORDER) {
      const issue = stepIssues[stepId][0];
      if (issue) return issue;
    }
    return '';
  }, [stepIssues]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 18 }}>
      <Text style={styles.title}>Dashboard ADM SaaS</Text>
      <Text style={styles.subtitle}>Cadastro da empresa, liberacao de modulos e integracao SaaS por cliente.</Text>

      {!isAdmin ? (
        <View style={[styles.panel, { marginBottom: 10 }]}>
          <Text style={{ color: '#ffb4b4' }}>Acesso restrito ao perfil ADM.</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Setup rapido</Text>
        <Text style={{ color: '#aac0df', marginBottom: 8 }}>Complete o fluxo em 3 etapas para liberar a empresa com seguranca.</Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity
            style={[styles.button, wizardMode ? styles.buttonOk : styles.buttonWarn, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
            disabled={!isAdmin}
            onPress={() => setWizardMode((prev) => !prev)}
          >
            <Text style={styles.buttonText}>{wizardMode ? 'Modo assistido: ON' : 'Modo assistido: OFF'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.badge, styles.badgeInfo, { marginBottom: 8 }]}>
          <Text style={styles.badgeText}>Progresso: {setupDoneCount}/3 etapas concluidas</Text>
        </View>

        {setupSteps.map((step, index) => {
          const isActive = wizardMode && activeStepId === step.id;
          const pendingCount = stepIssues[step.id].length;

          return (
            <TouchableOpacity
              key={step.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottomWidth: index === setupSteps.length - 1 ? 0 : 1,
                borderBottomColor: '#27446f',
                paddingVertical: 8,
                backgroundColor: isActive ? '#11305a' : 'transparent',
                borderRadius: 8,
                paddingHorizontal: 6,
              }}
              onPress={() => goToStep(step.id)}
            >
              <Text style={{ color: '#eaf3ff', fontWeight: '700' }}>{index + 1}. {step.label}</Text>
              <View style={[styles.badge, step.done ? styles.badgeOk : styles.badgeWarn, { marginBottom: 0 }]}>
                <Text style={styles.badgeText}>{step.done ? 'OK' : `Pendente (${pendingCount})`}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {wizardMode ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Navegacao assistida</Text>
          <Text style={{ color: '#aac0df', marginBottom: 8 }}>Etapa atual: {activeStep?.label || 'Dados da empresa'}</Text>

          {activeStepIssues.length > 0 ? (
            <View style={{ marginBottom: 8 }}>
              <View style={[styles.badge, styles.badgeWarn, { marginBottom: 6 }]}>
                <Text style={styles.badgeText}>Pendencias desta etapa: {activeStepIssues.length}</Text>
              </View>
              {activeStepIssues.map((issue) => (
                <Text key={issue} style={{ color: '#ffd8a8', marginBottom: 4 }}>
                  - {issue}
                </Text>
              ))}
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeOk, { marginBottom: 8 }]}>
              <Text style={styles.badgeText}>Etapa completa. Pode avancar.</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.button, { flex: 1, opacity: canGoPrev ? 1 : 0.55 }]} disabled={!canGoPrev} onPress={goPrevStep}>
              <Text style={styles.buttonText}>Anterior</Text>
            </TouchableOpacity>

            {activeStepId !== 'integration' ? (
              <TouchableOpacity style={[styles.button, styles.buttonOk, { flex: 1, opacity: canGoNext ? 1 : 0.55 }]} disabled={!canGoNext} onPress={goNextStep}>
                <Text style={styles.buttonText}>{canGoNext ? 'Proxima etapa' : 'Complete esta etapa'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.button, styles.buttonWarn, { flex: 1, opacity: canSave ? 1 : 0.55 }]} disabled={!canSave} onPress={saveAndTest}>
                <Text style={styles.buttonText}>Concluir e testar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}

      {!wizardMode || activeStepId === 'tenant' ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Empresas cadastradas</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tenants.map((tenant) => (
              <TouchableOpacity
                key={tenant.tenantId}
                style={[styles.chip, selectedTenantId === tenant.tenantId ? styles.chipActive : undefined]}
                onPress={() => selectTenant(tenant.tenantId)}
              >
                <Text style={styles.chipText}>{tenant.tenantName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
            disabled={!isAdmin}
            onPress={() => {
              setSelectedTenantId('');
              setSelectedPresetId('');
              setActiveStepId('tenant');
              setEditing(emptyTenant());
              setMessage('Novo cadastro. Preencha os dados da empresa.');
              setTestStatus(null);
              setConnectionChecks([]);
            }}
          >
            <Text style={styles.buttonText}>Nova empresa</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonWarn, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]} disabled={!isAdmin} onPress={suggestCompanyData}>
            <Text style={styles.buttonText}>Sugerir dados</Text>
          </TouchableOpacity>
        </View>
        </View>
      ) : null}

      {!wizardMode || activeStepId === 'tenant' ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Dados da empresa</Text>
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.tenantId}
          onChangeText={(value) => setEditing((prev) => ({ ...prev, tenantId: value }))}
          placeholder="tenant_id (ex: empresa_x)"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.tenantName}
          onChangeText={(value) => setEditing((prev) => ({ ...prev, tenantName: value }))}
          placeholder="Nome da empresa"
          placeholderTextColor="#7f95b7"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.licenseKey}
          onChangeText={(value) => setEditing((prev) => ({ ...prev, licenseKey: value }))}
          placeholder="Chave da licenca"
          placeholderTextColor="#7f95b7"
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.expiresAt}
          onChangeText={handleExpiresAtChange}
          placeholder="Expiracao ISO (ex: 2026-12-31T23:59:59Z)"
          placeholderTextColor="#7f95b7"
        />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
            disabled={!isAdmin}
            onPress={() => quickAddExpiresAtDays(30)}
          >
            <Text style={styles.buttonText}>+30 dias</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonOk, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
            disabled={!isAdmin}
            onPress={() => quickAddExpiresAtYears(1)}
          >
            <Text style={styles.buttonText}>+1 ano</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: '#aac0df', marginBottom: 8, fontSize: 12 }}>
          Dica: digite apenas numeros (AAAAMMDDHHmmss) para autoformatar.
        </Text>
        {editing.expiresAt.trim() ? (
          <View style={[styles.badge, isExpiresAtValid ? styles.badgeOk : styles.badgeWarn, { marginBottom: 10 }]}>
            <Text style={styles.badgeText}>
              {isExpiresAtValid ? 'Formato ISO valido.' : 'Formato invalido. Use: 2026-12-31T23:59:59Z'}
            </Text>
          </View>
        ) : null}
        </View>
      ) : null}

      {!wizardMode || activeStepId === 'modules' ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Modulos liberados para o Gestor</Text>
        <Text style={{ color: '#aac0df', marginBottom: 8 }}>Ative um ou mais modulos. O gestor so podera operar dentro deste teto.</Text>

        <Text style={{ color: '#eaf3ff', fontWeight: '700', marginBottom: 8 }}>Presets rapidos</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {BUSINESS_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[styles.chip, selectedPresetId === preset.id ? styles.chipActive : undefined, { opacity: isAdmin ? 1 : 0.6 }]}
              disabled={!isAdmin}
              onPress={() => applyBusinessPreset(preset.id)}
            >
              <Text style={styles.chipText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedPreset ? <Text style={{ color: '#aac0df', marginBottom: 8 }}>{selectedPreset.description}</Text> : null}

        <View style={[styles.badge, styles.badgeInfo, { marginBottom: 8 }]}>
          <Text style={styles.badgeText}>Modulos ativos: {moduleEnabledCount}/{MODULES.length}</Text>
        </View>

        {MODULES.map((item) => (
          <View key={item.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#27446f' }}>
            <Text style={{ color: '#eaf3ff', fontWeight: '700' }}>{item.label}</Text>
            <TouchableOpacity
              style={[styles.button, editing.moduleCaps[item.key] ? styles.buttonOk : styles.buttonDanger, { minWidth: 110, opacity: isAdmin ? 1 : 0.6 }]}
              disabled={!isAdmin}
              onPress={() => toggleModule(item.key)}
            >
              <Text style={styles.buttonText}>{editing.moduleCaps[item.key] ? 'Liberado' : 'Bloqueado'}</Text>
            </TouchableOpacity>
          </View>
        ))}
        </View>
      ) : null}

      {!wizardMode || activeStepId === 'integration' ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Integracao SaaS</Text>
        <Text style={{ color: '#aac0df', marginBottom: 8 }}>Configure API real do cliente para integracao rapida.</Text>

        <TouchableOpacity
          style={[styles.button, editing.integrationConfig.enabled ? styles.buttonOk : styles.buttonWarn, { marginBottom: 8, opacity: isAdmin ? 1 : 0.6 }]}
          disabled={!isAdmin}
          onPress={() => updateIntegration({ enabled: !editing.integrationConfig.enabled })}
        >
          <Text style={styles.buttonText}>{editing.integrationConfig.enabled ? 'Integracao ativa' : 'Integracao desativada'}</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.providerName}
          onChangeText={(value) => updateIntegration({ providerName: value })}
          placeholder="Nome do provedor/API"
          placeholderTextColor="#7f95b7"
        />
        <Text style={[styles.subtitle, { marginBottom: 8 }]}>Ambiente</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {ENV_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.chip, editing.integrationConfig.environment === option.id ? styles.chipActive : undefined, { opacity: isAdmin ? 1 : 0.6 }]}
              disabled={!isAdmin}
              onPress={() => updateEnvironment(option.id)}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.productionBaseUrl || ''}
          onChangeText={(value) => updateIntegration({ productionBaseUrl: value, baseUrl: value || editing.integrationConfig.baseUrl })}
          placeholder="URL Produção (ex: https://api.cliente.com)"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.sandboxBaseUrl || ''}
          onChangeText={(value) => updateIntegration({ sandboxBaseUrl: value })}
          placeholder="URL Sandbox (opcional)"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />

        <View style={[styles.badge, isBaseUrlValid ? styles.badgeOk : styles.badgeWarn, { marginBottom: 10 }]}> 
          <Text style={styles.badgeText}>
            {isBaseUrlValid
              ? 'URL ativa valida (' + (editing.integrationConfig.environment === 'sandbox' ? 'Sandbox' : 'Producao') + ').'
              : 'URL ativa invalida. Use http:// ou https://'}
          </Text>
        </View>

        <Text style={{ color: '#aac0df', marginBottom: 8 }}>
          URL ativa: {activeBaseUrl || '-'}
        </Text>
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={String(editing.integrationConfig.timeoutMs || 10000)}
          onChangeText={(value) => updateIntegration({ timeoutMs: Number(value) || 10000 })}
          placeholder="Timeout ms"
          placeholderTextColor="#7f95b7"
        />

        <Text style={[styles.subtitle, { marginBottom: 8 }]}>Autenticacao</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {AUTH_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.chip, editing.integrationConfig.authType === option.id ? styles.chipActive : undefined, { opacity: isAdmin ? 1 : 0.6 }]}
              disabled={!isAdmin}
              onPress={() => updateIntegration({ authType: option.id })}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {editing.integrationConfig.authType === 'bearer' ? (
          <>
            <TextInput
              style={styles.input}
              editable={isAdmin}
              value={editing.integrationConfig.bearerToken || ''}
              onChangeText={(value) => updateIntegration({ bearerToken: value })}
              placeholder="Bearer token"
              placeholderTextColor="#7f95b7"
              secureTextEntry={!showBearerToken}
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
                disabled={!isAdmin}
                onPress={() => setShowBearerToken((prev) => !prev)}
              >
                <Text style={styles.buttonText}>{showBearerToken ? 'Ocultar token' : 'Mostrar token'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonWarn, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
                disabled={!isAdmin}
                onPress={() => copySecret(editing.integrationConfig.bearerToken || '', 'Token')}
              >
                <Text style={styles.buttonText}>Copiar token</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {editing.integrationConfig.authType === 'api_key' ? (
          <>
            <TextInput
              style={styles.input}
              editable={isAdmin}
              value={editing.integrationConfig.apiKeyHeader || 'x-api-key'}
              onChangeText={(value) => updateIntegration({ apiKeyHeader: value })}
              placeholder="Header da API key"
              placeholderTextColor="#7f95b7"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              editable={isAdmin}
              value={editing.integrationConfig.apiKey || ''}
              onChangeText={(value) => updateIntegration({ apiKey: value })}
              placeholder="Valor da API key"
              placeholderTextColor="#7f95b7"
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
                disabled={!isAdmin}
                onPress={() => setShowApiKey((prev) => !prev)}
              >
                <Text style={styles.buttonText}>{showApiKey ? 'Ocultar API key' : 'Mostrar API key'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonWarn, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]}
                disabled={!isAdmin}
                onPress={() => copySecret(editing.integrationConfig.apiKey || '', 'API key')}
              >
                <Text style={styles.buttonText}>Copiar API key</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        <Text style={[styles.subtitle, { marginBottom: 8 }]}>Endpoints</Text>
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.endpoints.health}
          onChangeText={(value) => updateEndpoint('health', value)}
          placeholder="Health endpoint"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.endpoints.fetchProduct}
          onChangeText={(value) => updateEndpoint('fetchProduct', value)}
          placeholder="Buscar produto (use {barcode})"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.endpoints.sendOrder}
          onChangeText={(value) => updateEndpoint('sendOrder', value)}
          placeholder="Enviar pedido"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.endpoints.orderStatus}
          onChangeText={(value) => updateEndpoint('orderStatus', value)}
          placeholder="Status pedido (use {clientOrderId} ou {externalId})"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={editing.integrationConfig.endpoints.authenticate}
          onChangeText={(value) => updateEndpoint('authenticate', value)}
          placeholder="Endpoint de autenticacao (opcional)"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />

        <View
          style={{
            backgroundColor: '#0a1b35',
            borderColor: '#27446f',
            borderWidth: 1,
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#eaf3ff', fontWeight: '700', marginBottom: 8 }}>Preview de URLs finais</Text>
          <Text style={{ color: '#aac0df', marginBottom: 4 }}>Ambiente ativo: {editing.integrationConfig.environment === 'sandbox' ? 'Sandbox' : 'Producao'}</Text>
          <Text style={{ color: '#aac0df', marginBottom: 4 }}>Health: {resolvedUrls.health || '-'}</Text>
          <Text style={{ color: '#aac0df', marginBottom: 4 }}>Produto: {resolvedUrls.fetchProduct || '-'}</Text>
          <Text style={{ color: '#aac0df', marginBottom: 4 }}>Enviar pedido: {resolvedUrls.sendOrder || '-'}</Text>
          <Text style={{ color: '#aac0df', marginBottom: 4 }}>Status: {resolvedUrls.orderStatus || '-'}</Text>
          <Text style={{ color: '#aac0df' }}>Auth: {resolvedUrls.authenticate || '-'}</Text>
        </View>

        <TextInput
          style={styles.input}
          editable={isAdmin}
          value={testBarcode}
          onChangeText={setTestBarcode}
          placeholder="Codigo/ID para teste tecnico"
          placeholderTextColor="#7f95b7"
          autoCapitalize="none"
        />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.button, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]} disabled={!isAdmin} onPress={fillRestTemplate}>
            <Text style={styles.buttonText}>Modelo REST</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonOk, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]} disabled={!isAdmin} onPress={() => runConnectionTest()}>
            <Text style={styles.buttonText}>Testar conexao</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TouchableOpacity style={[styles.button, styles.buttonWarn, { flex: 1, opacity: isAdmin ? 1 : 0.6 }]} disabled={!isAdmin} onPress={fillVarejaoTemplate}>
            <Text style={styles.buttonText}>Modelo Varejao</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonWarn,
            {
              marginTop: 8,
              opacity: isAdmin && (connectionChecks.length > 0 || !!testStatus) ? 1 : 0.55,
            },
          ]}
          disabled={!isAdmin || (connectionChecks.length === 0 && !testStatus)}
          onPress={copyConnectionSummary}
        >
          <Text style={styles.buttonText}>Copiar resumo do teste</Text>
        </TouchableOpacity>

        {testStatus ? (
          <View
            style={[
              styles.badge,
              testStatus.kind === 'ok'
                ? styles.badgeOk
                : testStatus.kind === 'warn'
                  ? styles.badgeWarn
                  : testStatus.kind === 'error'
                    ? styles.badgeDanger
                    : styles.badgeInfo,
              { marginTop: 10 },
            ]}
          >
            <Text style={styles.badgeText}>{testStatus.text}</Text>
          </View>
        ) : null}

        {connectionChecks.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: '#eaf3ff', fontWeight: '700', marginBottom: 8 }}>Detalhe do teste tecnico</Text>
            {connectionChecks.map((check) => (
              <View
                key={check.id}
                style={{
                  backgroundColor: '#0a1b35',
                  borderColor: '#27446f',
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#eaf3ff', fontWeight: '700', marginBottom: 4 }}>{check.label}</Text>
                <Text style={{ color: '#aac0df', marginBottom: 4 }}>Status: {check.kind.toUpperCase()}</Text>
                <Text style={{ color: '#aac0df', marginBottom: 4 }}>Tempo: {check.durationMs} ms</Text>
                <Text style={{ color: '#aac0df' }}>{check.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
        </View>
      ) : null}

      {showSaveActions && !canSave ? (
        <View style={[styles.badge, styles.badgeWarn, { marginTop: 10 }]}>
          <Text style={styles.badgeText}>Ainda falta: {firstBlockingIssue || 'Revise as etapas.'}</Text>
        </View>
      ) : null}

      {showSaveActions ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.button, styles.buttonOk, { flex: 1, opacity: canSave ? 1 : 0.55 }]} disabled={!canSave} onPress={save}>
            <Text style={styles.buttonText}>Salvar cadastro</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonWarn, { flex: 1, opacity: canSave ? 1 : 0.55 }]} disabled={!canSave} onPress={saveAndTest}>
            <Text style={styles.buttonText}>Salvar e testar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!!message ? (
        <View style={[styles.badge, styles.badgeInfo, { marginTop: 10 }]}>
          <Text style={styles.badgeText}>{message}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
