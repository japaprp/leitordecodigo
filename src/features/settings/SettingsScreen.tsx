import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { ModuleToggles } from '../../core/types/models';

const MODULE_META: Array<{ key: keyof ModuleToggles; label: string; hint: string }> = [
  { key: 'scanner', label: 'Scanner de produtos', hint: 'Leitura por camera/QR para itens fisicos.' },
  { key: 'stockFlow', label: 'Leitura de estoque', hint: 'Modo de inventario para registrar estoque e enviar ao sistema.' },
  { key: 'manualCode', label: 'Codigo manual', hint: 'Permite digitar codigo quando a camera falhar.' },
  { key: 'serviceFlow', label: 'Fluxo de atendimento', hint: 'Modo com cardapio/lista para atendente/garcom.' },
  { key: 'tableField', label: 'Campo mesa/comanda', hint: 'Exibe identificador de mesa/comanda no atendimento.' },
  { key: 'kitchenRouting', label: 'Roteamento para cozinha', hint: 'Espelha producao para cozinha quando aplicavel.' },
  { key: 'tableClose', label: 'Fechamento de mesa', hint: 'Permite encerrar consumo e registrar pagamento.' },
  { key: 'favorites', label: 'Favoritos', hint: 'Atalhos de itens frequentes no atendimento.' },
  { key: 'topSelling', label: 'Mais vendidos', hint: 'Destaca itens de maior saida com base no historico.' },
  { key: 'history', label: 'Historico e metricas', hint: 'Mostra envios, pendencias e indicadores por celular.' },
];

function normalizeToggles(next: ModuleToggles): ModuleToggles {
  const normalized = { ...next };

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

  return normalized;
}

function applyLicenseLimits(next: ModuleToggles, tenant: ReturnType<typeof useAppStore.getState>['tenant']): ModuleToggles {
  const limited = { ...next };

  if (!tenant?.features.scannerMode) {
    limited.scanner = false;
    limited.stockFlow = false;
  }

  if (!tenant?.features.waiterMode) limited.serviceFlow = false;
  if (!tenant?.features.historyMode) limited.history = false;
  if (!tenant?.features.manualCode) limited.manualCode = false;

  if (tenant?.moduleCaps) {
    (Object.keys(limited) as Array<keyof ModuleToggles>).forEach((key) => {
      limited[key] = !!limited[key] && !!tenant.moduleCaps?.[key];
    });
  }

  return normalizeToggles(limited);
}

export function SettingsScreen() {
  const forceOffline = useAppStore((s) => s.forceOffline);
  const setForceOffline = useAppStore((s) => s.setForceOffline);
  const tenant = useAppStore((s) => s.tenant);
  const operator = useAppStore((s) => s.operator);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const moduleToggles = useAppStore((s) => s.moduleToggles);
  const setUiProfile = useAppStore((s) => s.setUiProfile);
  const setModuleToggles = useAppStore((s) => s.setModuleToggles);

  const canEdit = operator?.role === 'manager';

  const [scannerModeLabel, setScannerModeLabel] = useState(uiProfile.scannerModeLabel);
  const [stockModeLabel, setStockModeLabel] = useState(uiProfile.stockModeLabel);
  const [tableModeLabel, setTableModeLabel] = useState(uiProfile.tableModeLabel);
  const [serviceRoleLabel, setServiceRoleLabel] = useState(uiProfile.serviceRoleLabel);
  const [tableLabel, setTableLabel] = useState(uiProfile.tableLabel);
  const [localToggles, setLocalToggles] = useState<ModuleToggles>(moduleToggles);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setScannerModeLabel(uiProfile.scannerModeLabel);
    setStockModeLabel(uiProfile.stockModeLabel);
    setTableModeLabel(uiProfile.tableModeLabel);
    setServiceRoleLabel(uiProfile.serviceRoleLabel);
    setTableLabel(uiProfile.tableLabel);
  }, [uiProfile]);

  useEffect(() => {
    setLocalToggles(moduleToggles);
  }, [moduleToggles]);

  const applyPreset = (preset: 'food' | 'retail' | 'generic') => {
    if (!canEdit) return;

    let presetToggles: ModuleToggles;

    if (preset === 'food') {
      setScannerModeLabel('Caixa Scanner');
      setStockModeLabel('Leitura de Estoque');
      setTableModeLabel('Comanda de Atendimento');
      setServiceRoleLabel('Garcom');
      setTableLabel('Mesa');

      presetToggles = {
        scanner: true,
        stockFlow: false,
        manualCode: true,
        serviceFlow: true,
        tableField: true,
        kitchenRouting: true,
        tableClose: true,
        favorites: true,
        topSelling: true,
        history: true,
      };
    } else if (preset === 'retail') {
      setScannerModeLabel('Caixa e Leitura');
      setStockModeLabel('Inventario Rapido');
      setTableModeLabel('Atendimento Rapido');
      setServiceRoleLabel('Atendente');
      setTableLabel('Comanda');

      presetToggles = {
        scanner: true,
        stockFlow: true,
        manualCode: true,
        serviceFlow: false,
        tableField: false,
        kitchenRouting: false,
        tableClose: false,
        favorites: false,
        topSelling: false,
        history: true,
      };
    } else {
      setScannerModeLabel('Leitura de Produtos');
      setStockModeLabel('Leitura de Estoque');
      setTableModeLabel('Pedido Assistido');
      setServiceRoleLabel('Operador');
      setTableLabel('Atendimento');

      presetToggles = {
        scanner: true,
        stockFlow: true,
        manualCode: true,
        serviceFlow: true,
        tableField: false,
        kitchenRouting: false,
        tableClose: false,
        favorites: false,
        topSelling: false,
        history: true,
      };
    }

    setLocalToggles(applyLicenseLimits(presetToggles, tenant));
    setSaveMessage('Preset aplicado. Clique em "Salvar configuracoes" para confirmar.');
  };

  const moduleBlockedReason = (key: keyof ModuleToggles) => {
    if (!canEdit) return 'Somente Gestao';

    if (tenant?.moduleCaps && !tenant.moduleCaps[key]) return 'Bloqueado pelo ADM';

    if ((key === 'scanner' || key === 'stockFlow') && !tenant?.features.scannerMode) return 'Bloqueado pela licenca';
    if (key === 'serviceFlow' && !tenant?.features.waiterMode) return 'Bloqueado pela licenca';
    if (key === 'history' && !tenant?.features.historyMode) return 'Bloqueado pela licenca';
    if (key === 'manualCode' && !tenant?.features.manualCode) return 'Bloqueado pela licenca';

    if (['tableField', 'kitchenRouting', 'tableClose', 'favorites', 'topSelling'].includes(key) && !localToggles.serviceFlow) {
      return 'Ative o fluxo de atendimento';
    }

    if ((key === 'manualCode' || key === 'stockFlow') && !localToggles.scanner) {
      return 'Ative o scanner';
    }

    return null;
  };

  const toggleModule = (key: keyof ModuleToggles) => {
    if (!canEdit) return;
    if (moduleBlockedReason(key)) return;
    const next = normalizeToggles({ ...localToggles, [key]: !localToggles[key] });
    setLocalToggles(next);
    setSaveMessage('Alteracoes pendentes. Clique em "Salvar configuracoes".');
  };

  const persistProfile = () => {
    if (!canEdit) return;

    const profile = {
      scannerModeLabel: scannerModeLabel.trim() || 'Leitura de Produtos',
      stockModeLabel: stockModeLabel.trim() || 'Leitura de Estoque',
      tableModeLabel: tableModeLabel.trim() || 'Pedido Assistido',
      serviceRoleLabel: serviceRoleLabel.trim() || 'Atendente',
      tableLabel: tableLabel.trim() || 'Comanda',
    };
    const toggles = applyLicenseLimits(localToggles, tenant);

    setUiProfile(profile);
    setModuleToggles(toggles);
    setLocalToggles(toggles);
    setSaveMessage('Configuracoes salvas para este cliente.');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 18 }}>
      <Text style={styles.title}>Configuracoes de integracao</Text>
      <Text style={styles.subtitle}>Perfil atual: Adaptador PDV Simulado (MVP multi-tenant)</Text>

      {!canEdit ? (
        <View style={[styles.badge, styles.badgeWarn]}>
          <Text style={styles.badgeText}>Ajustes em modo leitura. Somente perfil Gestao pode editar.</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Tenant ativo</Text>
        <Text style={{ color: '#aac0df' }}>ID: {tenant?.tenantId || '-'}</Text>
        <Text style={{ color: '#aac0df' }}>Cliente: {tenant?.tenantName || '-'}</Text>
        <Text style={{ color: '#aac0df' }}>Licenca: {tenant?.licenseStatus || '-'}</Text>
        <Text style={{ color: '#aac0df' }}>Expira: {tenant?.expiresAt?.slice(0, 10) || '-'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Nomenclatura operacional</Text>
        <Text style={{ color: '#aac0df', marginBottom: 8 }}>Ajuste os nomes para cada cliente (garcom, atendente, caixa, mesa/comanda).</Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, opacity: canEdit ? 1 : 0.55 }]}
            disabled={!canEdit}
            onPress={() => applyPreset('food')}
          >
            <Text style={styles.buttonText}>Lanchonete/Bar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { flex: 1, opacity: canEdit ? 1 : 0.55 }]}
            disabled={!canEdit}
            onPress={() => applyPreset('retail')}
          >
            <Text style={styles.buttonText}>Mercado/Farmacia</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { flex: 1, opacity: canEdit ? 1 : 0.55 }]}
            disabled={!canEdit}
            onPress={() => applyPreset('generic')}
          >
            <Text style={styles.buttonText}>Generico</Text>
          </TouchableOpacity>
        </View>

        <TextInput style={styles.input} editable={canEdit} value={scannerModeLabel} onChangeText={setScannerModeLabel} placeholder="Nome do modo de caixa" placeholderTextColor="#7f95b7" />
        <TextInput style={styles.input} editable={canEdit} value={stockModeLabel} onChangeText={setStockModeLabel} placeholder="Nome do modo de estoque" placeholderTextColor="#7f95b7" />
        <TextInput style={styles.input} editable={canEdit} value={tableModeLabel} onChangeText={setTableModeLabel} placeholder="Nome do modo de atendimento" placeholderTextColor="#7f95b7" />
        <TextInput style={styles.input} editable={canEdit} value={serviceRoleLabel} onChangeText={setServiceRoleLabel} placeholder="Nome do papel (garcom/atendente)" placeholderTextColor="#7f95b7" />
        <TextInput style={styles.input} editable={canEdit} value={tableLabel} onChangeText={setTableLabel} placeholder="Nome de mesa/comanda" placeholderTextColor="#7f95b7" />
      </View>

      <View style={styles.panel}>
        <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Modulos por cliente</Text>
        <Text style={{ color: '#aac0df', marginBottom: 8 }}>Ative apenas o que faz sentido para nao confundir o operador.</Text>

        {MODULE_META.map((item) => {
          const blocked = moduleBlockedReason(item.key);
          const active = localToggles[item.key];
          return (
            <View
              key={item.key}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: '#27446f',
                paddingVertical: 9,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: '#eaf3ff', fontWeight: '700' }}>{item.label}</Text>
                <Text style={{ color: '#aac0df', fontSize: 12 }}>{item.hint}</Text>
                {blocked ? <Text style={{ color: '#f9c46b', fontSize: 12 }}>{blocked}</Text> : null}
              </View>
              <TouchableOpacity
                style={[
                  styles.button,
                  active ? styles.buttonOk : styles.buttonDanger,
                  { minWidth: 108, opacity: blocked ? 0.45 : 1 },
                ]}
                disabled={!!blocked}
                onPress={() => toggleModule(item.key)}
              >
                <Text style={styles.buttonText}>{active ? 'Ativado' : 'Desativado'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Salvar ajustes</Text>

        <TouchableOpacity style={[styles.button, styles.buttonOk, { opacity: canEdit ? 1 : 0.55 }]} disabled={!canEdit} onPress={persistProfile}>
          <Text style={styles.buttonText}>Salvar configuracoes</Text>
        </TouchableOpacity>

        {!!saveMessage && <Text style={{ color: '#a7f3d0', marginTop: 8 }}>{saveMessage}</Text>}
      </View>

      <View style={styles.panel}>
        <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>Modulos liberados por licenca</Text>
        <Text style={{ color: '#aac0df' }}>Scanner: {tenant?.features.scannerMode ? 'sim' : 'nao'}</Text>
        <Text style={{ color: '#aac0df' }}>Comanda: {tenant?.features.waiterMode ? 'sim' : 'nao'}</Text>
        <Text style={{ color: '#aac0df' }}>Historico: {tenant?.features.historyMode ? 'sim' : 'nao'}</Text>
        <Text style={{ color: '#aac0df' }}>Codigo manual: {tenant?.features.manualCode ? 'sim' : 'nao'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={{ color: '#fff', marginBottom: 8 }}>Simular API offline</Text>
        <TouchableOpacity
          style={[styles.button, forceOffline ? styles.buttonWarn : styles.buttonOk, { opacity: canEdit ? 1 : 0.55 }]}
          disabled={!canEdit}
          onPress={() => setForceOffline(!forceOffline)}
        >
          <Text style={styles.buttonText}>{forceOffline ? 'Offline ligado' : 'Offline desligado'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={{ color: '#aac0df' }}>
          Proxima etapa: conectar adapters reais de cada PDV mantendo isolamento por tenant e licenca.
        </Text>
      </View>
    </ScrollView>
  );
}

