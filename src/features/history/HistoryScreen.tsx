import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { styles } from '../../core/theme';
import { listHistory } from '../../data/storage/localDb';
import { useAppStore } from '../../core/store';

type HistoryRow = {
  id: number;
  created_at: string;
  mode: string;
  status: string;
  external_id: string | null;
  payload: string;
};

function routeLabel(target?: string) {
  if (target === 'cashier') return 'Caixa';
  if (target === 'kitchen') return 'Cozinha';
  return 'Sistema';
}

function localDateKey(dateValue: Date | string) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function HistoryScreen() {
  const tenantId = useAppStore((s) => s.tenant?.tenantId);
  const operator = useAppStore((s) => s.operator);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const load = useCallback(() => {
    if (!tenantId) {
      setHistory([]);
      return;
    }

    const rows = listHistory(tenantId);

    if (operator?.role === 'waiter') {
      const ownRows = rows.filter((row) => {
        try {
          const payload = JSON.parse(row.payload);
          return payload.operatorId === operator.id;
        } catch {
          return false;
        }
      });
      setHistory(ownRows);
      return;
    }

    setHistory(rows);
  }, [operator?.id, operator?.role, tenantId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const metrics = useMemo(() => {
    const todayKey = localDateKey(new Date());

    let salesToday = 0;
    let ordersToday = 0;
    let pendingCount = 0;
    let totalSentSales = 0;

    for (const row of history) {
      let payload: any;
      try {
        payload = JSON.parse(row.payload);
      } catch {
        continue;
      }

      const isCashRoute = payload.dispatchTarget === 'cashier' || payload.orderType === 'scanner';
      const isCloseEvent = payload.eventType === 'table_close';
      const rowDay = localDateKey(row.created_at);

      if (row.status === 'pending') pendingCount += 1;

      if (row.status === 'sent' && isCashRoute && !isCloseEvent) {
        const amount = Number(payload.total) || 0;
        totalSentSales += amount;

        if (rowDay === todayKey) {
          salesToday += amount;
          ordersToday += 1;
        }
      }
    }

    const avgTicket = ordersToday > 0 ? salesToday / ordersToday : 0;
    return { salesToday, ordersToday, avgTicket, pendingCount, totalSentSales };
  }, [history]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Historico de envios</Text>
      <Text style={styles.subtitle}>Tenant: {tenantId || '-'} | Operador: {operator?.name || '-'}</Text>

      {operator?.role === 'waiter' ? (
        <View style={[styles.badge, styles.badgeInfo]}>
          <Text style={styles.badgeText}>Visao limitada: somente registros do seu atendimento.</Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Painel de metricas</Text>
        <View style={[styles.badge, styles.badgeInfo]}>
          <Text style={styles.badgeText}>Este celular ja fechou R$ {metrics.totalSentSales.toFixed(2)} em vendas enviadas ao caixa.</Text>
        </View>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Vendas hoje</Text>
            <Text style={styles.kpiValue}>R$ {metrics.salesToday.toFixed(2)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Pedidos hoje</Text>
            <Text style={styles.kpiValue}>{metrics.ordersToday}</Text>
          </View>
        </View>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Ticket medio</Text>
            <Text style={styles.kpiValue}>R$ {metrics.avgTicket.toFixed(2)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Pendentes</Text>
            <Text style={styles.kpiValue}>{metrics.pendingCount}</Text>
          </View>
        </View>
      </View>

      {!history.length ? <View style={styles.emptyBox}><Text style={{ color: '#aac0df' }}>Sem registros para este cliente.</Text></View> : null}
      <FlatList
        data={history}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const payload = JSON.parse(item.payload);
          return (
            <View style={styles.panel}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {item.mode === 'table' ? uiProfile.tableModeLabel : item.mode === 'stock' ? uiProfile.stockModeLabel : uiProfile.scannerModeLabel} | {item.status}
              </Text>
              <Text style={{ color: '#aac0df' }}>{new Date(item.created_at).toLocaleString()}</Text>
              {payload.tableId ? <Text style={{ color: '#aac0df' }}>{uiProfile.tableLabel}: {payload.tableId}</Text> : null}
              <Text style={{ color: '#aac0df' }}>Rota: {routeLabel(payload.dispatchTarget)}{payload.eventType === 'table_close' ? ' | Fechamento de mesa' : ''}</Text>
              <Text style={{ color: '#d9e8ff' }}>Itens: {payload.items.length} | Total: R$ {Number(payload.total).toFixed(2)}</Text>
              {!!item.external_id && <Text style={{ color: '#86efac' }}>ID externo: {item.external_id}</Text>}
            </View>
          );
        }}
      />
    </View>
  );
}


