import React, { useMemo, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { Reveal } from '../../core/ui/Reveal';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

export function ReviewScreen({ navigation }: Props) {
  const items = useAppStore((s) => s.items);
  const total = useAppStore((s) => s.total);
  const updateQty = useAppStore((s) => s.updateQty);
  const removeItem = useAppStore((s) => s.removeItem);
  const clearItems = useAppStore((s) => s.clearItems);
  const sendCurrentOrder = useAppStore((s) => s.sendCurrentOrder);
  const syncPending = useAppStore((s) => s.syncPending);
  const sending = useAppStore((s) => s.sending);
  const mode = useAppStore((s) => s.mode);
  const session = useAppStore((s) => s.session);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const canUseFeature = useAppStore((s) => s.canUseFeature);
  const pendingCount = useAppStore((s) => s.pendingCount);
  const [status, setStatus] = useState('');

  const tableCloseEnabled = canUseFeature('tableClose');
  const historyEnabled = canUseFeature('history');

  const modeLabel =
    mode === 'table'
      ? uiProfile.tableModeLabel
      : mode === 'stock'
        ? uiProfile.stockModeLabel
        : uiProfile.scannerModeLabel;

  const statusType = useMemo(() => {
    const text = status.toLowerCase();
    if (!text) return 'info';
    if (text.includes('pendente') || text.includes('falha')) return 'danger';
    if (text.includes('parcial')) return 'warn';
    return 'ok';
  }, [status]);

  const goBackToMode = () => {
    if (mode === 'scanner') {
      navigation.navigate('Scanner');
      return;
    }

    if (mode === 'stock') {
      navigation.navigate('Stock');
      return;
    }

    navigation.navigate('Waiter');
  };

  const send = async () => {
    const result = await sendCurrentOrder();
    setStatus(result.message || (result.ok ? 'Enviado.' : 'Erro no envio.'));
  };

  const backLabel = mode === 'stock' ? 'Voltar estoque' : mode === 'table' ? 'Voltar atendimento' : 'Voltar leitura';

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Revisao do envio</Text>

      <Reveal delay={20}>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Itens</Text>
            <Text style={styles.kpiValue}>{items.length}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total</Text>
            <Text style={styles.kpiValue}>R$ {total().toFixed(2)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Pendentes</Text>
            <Text style={styles.kpiValue}>{pendingCount}</Text>
          </View>
        </View>
      </Reveal>

      <Reveal delay={50}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Resumo operacional</Text>
          <Text style={{ color: '#aac0df' }}>Modo: {modeLabel}</Text>
          {mode === 'table' && canUseFeature('tableField') ? <Text style={{ color: '#aac0df' }}>{uiProfile.tableLabel}: {session?.tableId || '-'}</Text> : null}
          {mode === 'table' ? <Text style={{ color: '#aac0df' }}>Conta: sempre sincroniza no Caixa</Text> : null}
          {mode === 'table' && canUseFeature('kitchenRouting') ? <Text style={{ color: '#aac0df' }}>Producao na Cozinha: {session?.enableKitchenProduction ? 'sim' : 'nao'}</Text> : null}
          {mode === 'stock' ? <Text style={{ color: '#aac0df' }}>Destino: Sistema (registro de estoque)</Text> : null}
        </View>
      </Reveal>

      {!!status ? (
        <Reveal delay={70}>
          <View style={[styles.badge, statusType === 'ok' ? styles.badgeOk : statusType === 'warn' ? styles.badgeWarn : statusType === 'danger' ? styles.badgeDanger : styles.badgeInfo]}>
            <Text style={styles.badgeText}>{status}</Text>
          </View>
        </Reveal>
      ) : null}

      <Reveal delay={90}>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.button, styles.buttonGhost, { flex: 1 }]} onPress={goBackToMode}>
            <Text style={styles.buttonText}>{backLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger, { flex: 1, opacity: items.length ? 1 : 0.55 }]}
            disabled={!items.length}
            onPress={() => {
              clearItems();
              setStatus('Itens removidos da revisao.');
            }}
          >
            <Text style={styles.buttonText}>Limpar revisao</Text>
          </TouchableOpacity>
        </View>
      </Reveal>

      <Reveal delay={120} style={{ flex: 1 }}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.barcode}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={10}
          ListEmptyComponent={<View style={styles.emptyBox}><Text style={{ color: '#aac0df' }}>Sem itens para revisar.</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.panel}>
              <Text style={{ color: '#edf4ff', fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: '#aac0df' }}>{item.barcode}</Text>
              <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}> 
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.button, styles.qtyButton]} onPress={() => updateQty(item.barcode, -1)}><Text style={styles.buttonText}>-</Text></TouchableOpacity>
                  <Text style={{ color: '#fff', minWidth: 36, textAlign: 'center', fontWeight: '700' }}>{item.quantity}</Text>
                  <TouchableOpacity style={[styles.button, styles.qtyButton]} onPress={() => updateQty(item.barcode, 1)}><Text style={styles.buttonText}>+</Text></TouchableOpacity>
                </View>
                <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={() => removeItem(item.barcode)}><Text style={styles.buttonText}>Remover</Text></TouchableOpacity>
              </View>
            </View>
          )}
        />
      </Reveal>

      <Reveal delay={150}>
        <View style={styles.ctaBar}>
          <TouchableOpacity style={[styles.button, styles.buttonOk, { marginBottom: 8, opacity: sending || !items.length ? 0.6 : 1 }]} onPress={send} disabled={sending || !items.length}>
            <Text style={styles.buttonText}>{sending ? 'Enviando...' : 'Enviar para o sistema'}</Text>
          </TouchableOpacity>

          {mode === 'table' && tableCloseEnabled ? (
            <TouchableOpacity style={[styles.button, styles.buttonWarn, { marginBottom: 8 }]} onPress={() => navigation.navigate('CloseTable')}>
              <Text style={styles.buttonText}>Fechar {uiProfile.tableLabel.toLowerCase()}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.button, { marginBottom: 8 }]}
            onPress={async () => {
              const result = await syncPending();
              if (result.synced === 0 && result.duplicates > 0 && result.failed === 0) {
                setStatus(`${result.duplicates} acao(oes) ja estavam registradas.`);
                return;
              }

              setStatus(`${result.synced} sincronizado(s), ${result.duplicates} ja registrado(s), ${result.failed} falha(s).`);
            }}
          >
            <Text style={styles.buttonText}>Sincronizar pendentes</Text>
          </TouchableOpacity>

          {historyEnabled ? (
            <TouchableOpacity style={[styles.button]} onPress={() => navigation.navigate('History')}>
              <Text style={styles.buttonText}>Ver historico</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Reveal>
    </View>
  );
}
