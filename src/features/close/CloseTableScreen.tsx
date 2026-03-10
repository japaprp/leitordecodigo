import React, { useCallback, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { listHistory } from '../../data/storage/localDb';
import { PaymentMethod } from '../../core/types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'CloseTable'>;

function parseMoney(value: string) {
  const normalized = value.replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function CloseTableScreen({ navigation }: Props) {
  const operator = useAppStore((s) => s.operator);
  const tenantId = useAppStore((s) => s.tenant?.tenantId);
  const session = useAppStore((s) => s.session);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const canUseFeature = useAppStore((s) => s.canUseFeature);
  const closeTable = useAppStore((s) => s.closeTable);
  const sending = useAppStore((s) => s.sending);

  const tableFieldEnabled = canUseFeature('tableField');
  const closeEnabled = canUseFeature('tableClose');
  const roleAllowed = operator?.role === 'cashier' || operator?.role === 'manager';

  const [subtotal, setSubtotal] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [serviceFee, setServiceFee] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [status, setStatus] = useState('');

  const detectedSubtotal = useMemo(() => {
    if (!tenantId) return 0;

    const tableRef = tableFieldEnabled ? session?.tableId : 'geral';
    if (!tableRef) return 0;

    const history = listHistory(tenantId);
    let totalOrders = 0;
    let totalClosed = 0;

    for (const row of history) {
      if (row.status !== 'sent') continue;

      try {
        const payload = JSON.parse(row.payload);
        if (payload.tableId !== tableRef) continue;
        if (payload.dispatchTarget !== 'cashier') continue;

        if (payload.eventType === 'table_close') {
          totalClosed += Number(payload.payment?.total || payload.total || 0);
        } else {
          totalOrders += Number(payload.total || 0);
        }
      } catch {
        continue;
      }
    }

    return Math.max(0, totalOrders - totalClosed);
  }, [session?.tableId, tableFieldEnabled, tenantId]);

  useFocusEffect(
    useCallback(() => {
      setSubtotal(detectedSubtotal.toFixed(2));
    }, [detectedSubtotal])
  );

  const subtotalValue = parseMoney(subtotal);
  const discountValue = parseMoney(discount);
  const serviceFeeValue = parseMoney(serviceFee);
  const finalTotal = Math.max(0, subtotalValue - discountValue + serviceFeeValue);

  const submitClose = async () => {
    const result = await closeTable({
      subtotal: subtotalValue,
      discount: discountValue,
      serviceFee: serviceFeeValue,
      method,
    });

    setStatus(result.message || (result.ok ? 'Mesa fechada.' : 'Falha ao fechar mesa.'));
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Fechamento de {uiProfile.tableLabel}</Text>
      <Text style={styles.subtitle}>{tableFieldEnabled ? `${uiProfile.tableLabel} atual: ${session?.tableId || '-'}` : 'Fechamento sem mesa (modo balcão)'}</Text>

      {!roleAllowed ? (
        <View style={styles.panel}>
          <Text style={{ color: '#ffb4b4', marginBottom: 10 }}>Fechamento liberado apenas para perfil Caixa ou Gestao.</Text>
          <TouchableOpacity style={[styles.button]} onPress={() => navigation.replace('Mode')}>
            <Text style={styles.buttonText}>Voltar para setores</Text>
          </TouchableOpacity>
        </View>
      ) : !closeEnabled ? (
        <View style={styles.panel}>
          <Text style={{ color: '#ffb4b4', marginBottom: 10 }}>Fechamento desativado para este cliente.</Text>
          <TouchableOpacity style={[styles.button]} onPress={() => navigation.navigate('Review')}>
            <Text style={styles.buttonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : tableFieldEnabled && !session?.tableId ? (
        <View style={styles.panel}>
          <Text style={{ color: '#ffb4b4', marginBottom: 10 }}>Nenhuma mesa/comanda ativa para fechamento.</Text>
          <TouchableOpacity style={[styles.button]} onPress={() => navigation.navigate('Waiter')}>
            <Text style={styles.buttonText}>Voltar para comanda</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Subtotal detectado</Text>
              <Text style={styles.kpiValue}>R$ {detectedSubtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total final</Text>
              <Text style={styles.kpiValue}>R$ {finalTotal.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Ajustes de pagamento</Text>
            <TextInput style={styles.input} value={subtotal} onChangeText={setSubtotal} placeholder="Subtotal" placeholderTextColor="#7f95b7" keyboardType="decimal-pad" />
            <TextInput style={styles.input} value={discount} onChangeText={setDiscount} placeholder="Desconto" placeholderTextColor="#7f95b7" keyboardType="decimal-pad" />
            <TextInput style={styles.input} value={serviceFee} onChangeText={setServiceFee} placeholder="Taxa de serviço" placeholderTextColor="#7f95b7" keyboardType="decimal-pad" />

            <Text style={[styles.subtitle, { marginBottom: 8 }]}>Forma de pagamento</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {(
                [
                  { id: 'pix', label: 'PIX' },
                  { id: 'dinheiro', label: 'Dinheiro' },
                  { id: 'cartao_debito', label: 'Débito' },
                  { id: 'cartao_credito', label: 'Crédito' },
                  { id: 'misto', label: 'Misto' },
                ] as Array<{ id: PaymentMethod; label: string }>
              ).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, method === item.id ? styles.chipActive : undefined]}
                  onPress={() => setMethod(item.id)}
                >
                  <Text style={styles.chipText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.button, styles.buttonOk, { opacity: sending ? 0.6 : 1 }]} disabled={sending} onPress={submitClose}>
              <Text style={styles.buttonText}>{sending ? 'Fechando...' : `Confirmar fechamento (R$ ${finalTotal.toFixed(2)})`}</Text>
            </TouchableOpacity>
          </View>

          {!!status ? (
            <View style={[styles.badge, status.toLowerCase().includes('falha') ? styles.badgeDanger : styles.badgeOk]}>
              <Text style={styles.badgeText}>{status}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

