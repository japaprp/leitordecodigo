import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { Product } from '../../core/types/models';
import { listFavorites, listHistory, toggleFavorite } from '../../data/storage/localDb';

type Props = NativeStackScreenProps<RootStackParamList, 'Waiter'>;
type MenuItem = Product & { category: string; description: string };

const MENU_LANCHONETE: MenuItem[] = [
  { barcode: '7891000000103', productId: 'm1', sku: 'LAN-001', name: 'Hambúrguer Artesanal', unitPrice: 28.9, stock: 999, category: 'Lanches', description: 'Pão brioche, blend 180g e queijo.' },
  { barcode: '7891000000104', productId: 'm2', sku: 'LAN-002', name: 'X-Salada', unitPrice: 24.9, stock: 999, category: 'Lanches', description: 'Tradicional com alface e tomate.' },
  { barcode: '7891000000105', productId: 'm3', sku: 'POR-001', name: 'Batata Média', unitPrice: 29.9, stock: 999, category: 'Porções', description: 'Porção média crocante.' },
  { barcode: '7891000000106', productId: 'm4', sku: 'POR-002', name: 'Torresmo', unitPrice: 24.9, stock: 999, category: 'Porções', description: 'Torresmo sequinho.' },
  { barcode: '7891000000107', productId: 'm5', sku: 'BEB-001', name: 'Cerveja Lata 350ml', unitPrice: 9.0, stock: 999, category: 'Bebidas', description: 'Gelada para consumo imediato.' },
  { barcode: '7891000000108', productId: 'm6', sku: 'BEB-002', name: 'Refrigerante Lata', unitPrice: 7.0, stock: 999, category: 'Bebidas', description: 'Opção normal ou zero.' },
  { barcode: '7891000000109', productId: 'm7', sku: 'SOB-001', name: 'Brownie', unitPrice: 13.9, stock: 999, category: 'Sobremesas', description: 'Com calda de chocolate.' },
];

const MENU_GENERICO: MenuItem[] = [
  { barcode: '7899000001001', productId: 'g1', sku: 'BAL-001', name: 'Item de Balcão A', unitPrice: 19.9, stock: 999, category: 'Balcão', description: 'Produto para atendimento rápido.' },
  { barcode: '7899000001002', productId: 'g2', sku: 'BAL-002', name: 'Item de Balcão B', unitPrice: 11.5, stock: 999, category: 'Balcão', description: 'Pode ser trocado pelo catálogo do cliente.' },
  { barcode: '7899000001003', productId: 'g3', sku: 'SERV-001', name: 'Serviço Especial', unitPrice: 29.0, stock: 999, category: 'Serviços', description: 'Uso para lojas sem mesa.' },
  { barcode: '7899000001004', productId: 'g4', sku: 'BEB-900', name: 'Bebida', unitPrice: 6.9, stock: 999, category: 'Bebidas', description: 'Exemplo para personalização.' },
];

export function WaiterScreen({ navigation }: Props) {
  const session = useAppStore((s) => s.session);
  const tenant = useAppStore((s) => s.tenant);
  const operator = useAppStore((s) => s.operator);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const canUseMode = useAppStore((s) => s.canUseMode);
  const canUseFeature = useAppStore((s) => s.canUseFeature);
  const setSession = useAppStore((s) => s.setSession);
  const items = useAppStore((s) => s.items);
  const addByProduct = useAppStore((s) => s.addByProduct);
  const updateQty = useAppStore((s) => s.updateQty);
  const removeItem = useAppStore((s) => s.removeItem);
  const total = useAppStore((s) => s.total);

  const tableFieldEnabled = canUseFeature('tableField');
  const kitchenEnabled = canUseFeature('kitchenRouting');
  const favoritesEnabled = canUseFeature('favorites');
  const topEnabled = canUseFeature('topSelling');
  const closeEnabled = canUseFeature('tableClose');

  const [tableId, setTableId] = useState(session?.tableId || '3');
  const [enableKitchenProduction, setEnableKitchenProduction] = useState(session?.enableKitchenProduction ?? true);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'favorites' | 'top'>('all');
  const [lastAction, setLastAction] = useState('');
  const [favoriteBarcodes, setFavoriteBarcodes] = useState<string[]>([]);
  const enabled = canUseMode('table');
  const roleAllowed = operator?.role === 'waiter' || operator?.role === 'manager';

  const menu = useMemo(() => {
    if (tenant?.tenantId?.includes('lanchonete')) return MENU_LANCHONETE;
    return MENU_GENERICO;
  }, [tenant?.tenantId]);

  const loadFavorites = useCallback(() => {
    if (!tenant?.tenantId || !favoritesEnabled) {
      setFavoriteBarcodes([]);
      return;
    }
    setFavoriteBarcodes(listFavorites(tenant.tenantId));
  }, [favoritesEnabled, tenant?.tenantId]);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

  const topSellingBarcodes = useMemo(() => {
    if (!tenant?.tenantId || !topEnabled) return [];

    const agg: Record<string, number> = {};
    const history = listHistory(tenant.tenantId);

    for (const row of history) {
      if (row.status !== 'sent') continue;
      try {
        const payload = JSON.parse(row.payload);
        if (payload.dispatchTarget !== 'cashier') continue;
        if (payload.eventType === 'table_close') continue;
        for (const item of payload.items || []) {
          agg[item.barcode] = (agg[item.barcode] || 0) + Number(item.quantity || 0);
        }
      } catch {
        continue;
      }
    }

    return Object.entries(agg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([barcode]) => barcode);
  }, [tenant?.tenantId, topEnabled]);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(menu.map((item) => item.category)))], [menu]);

  const filteredMenu = useMemo(() => {
    const term = search.trim().toLowerCase();

    return menu.filter((item) => {
      const byCategory = activeCategory === 'Todos' || item.category === activeCategory;
      if (!byCategory) return false;

      if (viewMode === 'favorites' && (!favoritesEnabled || !favoriteBarcodes.includes(item.barcode))) return false;
      if (viewMode === 'top' && (!topEnabled || !topSellingBarcodes.includes(item.barcode))) return false;

      if (!term) return true;
      return item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
    });
  }, [activeCategory, favoriteBarcodes, favoritesEnabled, menu, search, topEnabled, topSellingBarcodes, viewMode]);

  const applyContext = () => {
    if (!session) return;
    const normalizedTable = tableId.trim();
    setSession({
      ...session,
      tableId: tableFieldEnabled ? normalizedTable || undefined : undefined,
      enableKitchenProduction: kitchenEnabled ? enableKitchenProduction : false,
    });
    setLastAction('Contexto aplicado.');
  };

  const addMenuItem = async (item: MenuItem) => {
    addByProduct(item);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLastAction(`${item.name} adicionado.`);
  };

  const onToggleFavorite = (barcode: string) => {
    if (!tenant?.tenantId || !favoritesEnabled) return;
    const nowFavorite = toggleFavorite(tenant.tenantId, barcode);
    setFavoriteBarcodes(listFavorites(tenant.tenantId));
    setLastAction(nowFavorite ? 'Item salvo como favorito.' : 'Item removido dos favoritos.');
  };

  const allowedViews: Array<'all' | 'favorites' | 'top'> = ['all', ...(favoritesEnabled ? (['favorites'] as const) : []), ...(topEnabled ? (['top'] as const) : [])];

  if (!roleAllowed) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{uiProfile.tableModeLabel}</Text>
        <View style={styles.panel}>
          <Text style={{ color: '#ffb4b4', marginBottom: 8 }}>Tela de atendimento liberada apenas para perfil Garcom ou Gestao.</Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Mode')}>
            <Text style={styles.buttonText}>Voltar para setores</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{uiProfile.tableModeLabel}</Text>
        <View style={styles.panel}>
          <Text style={{ color: '#ffb4b4' }}>Atendimento/comanda desativado para este cliente.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 16 }}>
      <Text style={styles.title}>{uiProfile.tableModeLabel}</Text>
      <Text style={styles.subtitle}>Fluxo sem câmera | {uiProfile.serviceRoleLabel}: {operator?.name || '-'} | Tenant: {tenant?.tenantId || '-'}</Text>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{tableFieldEnabled ? uiProfile.tableLabel : 'Atendimento'}</Text>
          <Text style={styles.kpiValue}>{tableFieldEnabled ? tableId || '-' : 'Balcão'}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total parcial</Text>
          <Text style={styles.kpiValue}>R$ {total().toFixed(2)}</Text>
        </View>
      </View>

      {lastAction ? (
        <View style={[styles.badge, styles.badgeOk]}>
          <Text style={styles.badgeText}>{lastAction}</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Contexto de atendimento</Text>
        {tableFieldEnabled ? (
          <TextInput
            style={[styles.input, { marginBottom: 8 }]}
            value={tableId}
            onChangeText={setTableId}
            placeholder={uiProfile.tableLabel}
            placeholderTextColor="#7f95b7"
          />
        ) : (
          <Text style={{ color: '#aac0df', marginBottom: 8 }}>Identificador de mesa/comanda desativado para este cliente.</Text>
        )}

        {kitchenEnabled ? (
          <>
            <Text style={{ color: '#aac0df', marginBottom: 8 }}>Sincronização de rotas</Text>
            <View style={styles.panel}>
              <Text style={{ color: '#d9e8ff', marginBottom: 4 }}>Conta: <Text style={{ color: '#86efac', fontWeight: '700' }}>sempre enviada para o Caixa</Text></Text>
              <Text style={{ color: '#d9e8ff' }}>Produção: {enableKitchenProduction ? 'enviar também para Cozinha' : 'não enviar para Cozinha'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.button, enableKitchenProduction ? styles.buttonOk : styles.buttonWarn, { marginBottom: 8 }]}
              onPress={() => setEnableKitchenProduction((value) => !value)}
            >
              <Text style={styles.buttonText}>{enableKitchenProduction ? 'Cozinha ativada' : 'Cozinha desativada'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={{ color: '#aac0df', marginBottom: 8 }}>Envio para cozinha desativado para este cliente.</Text>
        )}

        <TouchableOpacity style={[styles.button, styles.buttonWarn]} onPress={applyContext}>
          <Text style={styles.buttonText}>Aplicar contexto</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Cardápio / Produtos</Text>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar item por nome"
          placeholderTextColor="#7f95b7"
        />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {allowedViews.includes('all') ? (
            <TouchableOpacity style={[styles.chip, viewMode === 'all' ? styles.chipActive : undefined]} onPress={() => setViewMode('all')}>
              <Text style={styles.chipText}>Todos</Text>
            </TouchableOpacity>
          ) : null}
          {allowedViews.includes('favorites') ? (
            <TouchableOpacity style={[styles.chip, viewMode === 'favorites' ? styles.chipActive : undefined]} onPress={() => setViewMode('favorites')}>
              <Text style={styles.chipText}>Favoritos</Text>
            </TouchableOpacity>
          ) : null}
          {allowedViews.includes('top') ? (
            <TouchableOpacity style={[styles.chip, viewMode === 'top' ? styles.chipActive : undefined]} onPress={() => setViewMode('top')}>
              <Text style={styles.chipText}>Mais vendidos</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.chip, activeCategory === category ? styles.chipActive : undefined]}
                onPress={() => setActiveCategory(category)}
              >
                <Text style={styles.chipText}>{category}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {!filteredMenu.length ? (
          <View style={styles.emptyBox}>
            <Text style={{ color: '#aac0df' }}>Nenhum item encontrado com esse filtro.</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {filteredMenu.map((item) => {
            const isFavorite = favoriteBarcodes.includes(item.barcode);
            const isTop = topSellingBarcodes.includes(item.barcode);

            return (
              <View key={item.productId} style={[styles.panel, { width: '48%' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <Text style={{ color: '#edf4ff', fontWeight: '700', flex: 1 }}>{item.name}</Text>
                  {favoritesEnabled ? (
                    <TouchableOpacity onPress={() => onToggleFavorite(item.barcode)} style={{ marginLeft: 6 }}>
                      <Text style={{ color: isFavorite ? '#ffd66b' : '#aac0df', fontSize: 18 }}>{isFavorite ? '★' : '☆'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {topEnabled && isTop ? (
                  <View style={[styles.badge, styles.badgeInfo, { marginBottom: 6 }]}>
                    <Text style={styles.badgeText}>Mais vendido</Text>
                  </View>
                ) : null}

                <Text style={{ color: '#aac0df', fontSize: 12, marginBottom: 6 }}>{item.description}</Text>
                <Text style={{ color: '#86efac', fontWeight: '700', marginBottom: 8 }}>R$ {item.unitPrice.toFixed(2)}</Text>
                <TouchableOpacity style={[styles.button, styles.buttonOk]} onPress={() => addMenuItem(item)}>
                  <Text style={styles.buttonText}>Adicionar</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={[styles.subtitle, { marginTop: 4 }]}>Itens na comanda ({items.length})</Text>
      {!items.length ? (
        <View style={styles.emptyBox}>
          <Text style={{ color: '#aac0df' }}>Nenhum item adicionado ainda.</Text>
        </View>
      ) : null}

      {items.map((item) => (
        <View key={item.barcode} style={styles.panel}>
          <Text style={{ color: '#edf4ff', fontWeight: '700' }}>{item.name}</Text>
          <View style={[styles.row, { marginTop: 6, justifyContent: 'space-between' }]}>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.button, { paddingHorizontal: 10 }]} onPress={() => updateQty(item.barcode, -1)}><Text style={styles.buttonText}>-</Text></TouchableOpacity>
              <Text style={{ color: '#fff', minWidth: 30, textAlign: 'center' }}>{item.quantity}</Text>
              <TouchableOpacity style={[styles.button, { paddingHorizontal: 10 }]} onPress={() => updateQty(item.barcode, 1)}><Text style={styles.buttonText}>+</Text></TouchableOpacity>
            </View>
            <View style={[styles.row, { gap: 6 }]}> 
              <Text style={{ color: '#86efac', fontWeight: '700' }}>R$ {item.subtotal.toFixed(2)}</Text>
              <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={() => removeItem(item.barcode)}>
                <Text style={styles.buttonText}>X</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      <View style={styles.ctaBar}>
        <TouchableOpacity style={[styles.button, styles.buttonOk, { marginBottom: 8 }]} onPress={() => { applyContext(); navigation.navigate('Review'); }}>
          <Text style={styles.buttonText}>Revisar e enviar (R$ {total().toFixed(2)})</Text>
        </TouchableOpacity>
        {closeEnabled ? (
          <TouchableOpacity style={[styles.button, styles.buttonWarn]} onPress={() => { applyContext(); navigation.navigate('CloseTable'); }}>
            <Text style={styles.buttonText}>Fechar {uiProfile.tableLabel.toLowerCase()}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

