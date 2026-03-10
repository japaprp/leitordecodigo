import React, { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { Reveal } from '../../core/ui/Reveal';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

export function StockScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error' | 'info'; message: string } | null>(null);

  const operator = useAppStore((s) => s.operator);
  const tenant = useAppStore((s) => s.tenant);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const items = useAppStore((s) => s.items);
  const addManualBarcode = useAppStore((s) => s.addManualBarcode);
  const updateQty = useAppStore((s) => s.updateQty);
  const clearItems = useAppStore((s) => s.clearItems);
  const total = useAppStore((s) => s.total);
  const canUseMode = useAppStore((s) => s.canUseMode);
  const canUseFeature = useAppStore((s) => s.canUseFeature);
  const pendingCount = useAppStore((s) => s.pendingCount);

  const hasPermission = useMemo(() => !!permission?.granted, [permission]);
  const enabled = canUseMode('stock');
  const manualEnabled = canUseFeature('manualCode');
  const roleAllowed = operator?.role === 'cashier' || operator?.role === 'manager';

  const showFeedback = (type: 'ok' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 1800);
  };

  const handleCode = async (barcode: string) => {
    const clean = barcode.trim();
    if (!enabled || !roleAllowed || locked || !clean) return;

    setLocked(true);
    const result = await addManualBarcode(clean);

    if (result.ok) {
      showFeedback('ok', 'Item registrado no inventario.');
    } else {
      showFeedback('error', result.message || 'Falha na leitura.');
    }

    setTimeout(() => setLocked(false), 550);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{uiProfile.stockModeLabel}</Text>
      <Text style={styles.subtitle}>Leitura para estoque/inventario | Tenant: {tenant?.tenantId || '-'}</Text>

      {!roleAllowed ? (
        <View style={styles.panel}>
          <Text style={{ color: '#ffb4b4', marginBottom: 8 }}>Modo de estoque liberado apenas para perfil Caixa ou Gestao.</Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Mode')}>
            <Text style={styles.buttonText}>Voltar para setores</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Reveal delay={20}>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Itens lidos</Text>
                <Text style={styles.kpiValue}>{items.length}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Valor de referencia</Text>
                <Text style={styles.kpiValue}>R$ {total().toFixed(2)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Pendentes</Text>
                <Text style={styles.kpiValue}>{pendingCount}</Text>
              </View>
            </View>
          </Reveal>

          <Reveal delay={50}>
            {feedback ? (
              <View style={[styles.badge, feedback.type === 'ok' ? styles.badgeOk : feedback.type === 'error' ? styles.badgeDanger : styles.badgeInfo]}>
                <Text style={styles.badgeText}>{feedback.message}</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeInfo]}>
                <Text style={styles.badgeText}>{locked ? 'Aguarde proxima leitura...' : 'Pronto para leitura.'}</Text>
              </View>
            )}
          </Reveal>

          <Reveal delay={80}>
            {!enabled ? (
              <View style={styles.panel}>
                <Text style={{ color: '#ffb4b4' }}>Modo de estoque desativado para este cliente.</Text>
              </View>
            ) : !hasPermission ? (
              <TouchableOpacity style={[styles.button, styles.buttonOk, { marginBottom: 10 }]} onPress={requestPermission}>
                <Text style={styles.buttonText}>Permitir camera</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.panel, styles.cameraWrap]}>
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'upc_a', 'upc_e', 'qr'] }}
                  onBarcodeScanned={(e) => handleCode(e.data)}
                />
                <View style={styles.cameraOverlay} pointerEvents="none">
                  <View style={styles.cameraFocusFrame} />
                  <Text style={styles.cameraHint}>Leitura rapida de item fisico</Text>
                </View>
              </View>
            )}
          </Reveal>

          <Reveal delay={110}>
            {manualEnabled ? (
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={manual}
                  onChangeText={setManual}
                  placeholder="Digitar codigo/ID/QR manual"
                  placeholderTextColor="#7f95b7"
                  keyboardType="default"
                  autoCapitalize="none"
                  editable={enabled}
                  returnKeyType="send"
                  onSubmitEditing={async () => {
                    await handleCode(manual);
                    setManual('');
                  }}
                />
                <TouchableOpacity
                  style={[styles.button, styles.buttonWarn, { opacity: enabled ? 1 : 0.6 }]}
                  disabled={!enabled}
                  onPress={async () => {
                    await handleCode(manual);
                    setManual('');
                  }}
                >
                  <Text style={styles.buttonText}>Adicionar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.panel}>
                <Text style={{ color: '#aac0df' }}>Codigo manual desativado para este cliente.</Text>
              </View>
            )}
          </Reveal>

          <Reveal delay={140}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonGhost, { flex: 1, opacity: items.length ? 1 : 0.55 }]}
                disabled={!items.length}
                onPress={() => {
                  clearItems();
                  showFeedback('info', 'Lista de inventario limpa.');
                }}
              >
                <Text style={styles.buttonText}>Limpar lista</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.buttonOk, { flex: 1 }]} onPress={() => navigation.navigate('Review')}>
                <Text style={styles.buttonText}>Revisar estoque</Text>
              </TouchableOpacity>
            </View>
          </Reveal>

          <Reveal delay={170} style={{ flex: 1 }}>
            <Text style={[styles.subtitle, { marginTop: 2 }]}>Itens de estoque ({items.length})</Text>
            <FlatList
              data={items}
              keyExtractor={(item) => item.barcode}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              initialNumToRender={6}
              maxToRenderPerBatch={10}
              ListEmptyComponent={<View style={styles.emptyBox}><Text style={{ color: '#aac0df' }}>Nenhum item lido ainda.</Text></View>}
              renderItem={({ item }) => (
                <View style={styles.panel}>
                  <Text style={{ color: '#edf4ff', fontWeight: '700' }}>{item.name}</Text>
                  <Text style={{ color: '#aac0df' }}>{item.barcode} | Estoque API: {item.stock}</Text>
                  <View style={[styles.row, { marginTop: 8, justifyContent: 'space-between' }]}> 
                    <View style={styles.row}>
                      <TouchableOpacity style={[styles.button, styles.qtyButton]} onPress={() => updateQty(item.barcode, -1)}><Text style={styles.buttonText}>-</Text></TouchableOpacity>
                      <Text style={{ color: '#fff', minWidth: 40, textAlign: 'center', fontWeight: '700' }}>{item.quantity}</Text>
                      <TouchableOpacity style={[styles.button, styles.qtyButton]} onPress={() => updateQty(item.barcode, 1)}><Text style={styles.buttonText}>+</Text></TouchableOpacity>
                    </View>
                    <Text style={{ color: '#86efac', fontWeight: '700' }}>Qtd: {item.quantity}</Text>
                  </View>
                </View>
              )}
            />
          </Reveal>

          <Reveal delay={210}>
            <View style={styles.ctaBar}>
              <TouchableOpacity style={[styles.button, styles.buttonOk]} onPress={() => navigation.navigate('Review')}>
                <Text style={styles.buttonText}>Finalizar revisao de estoque</Text>
              </TouchableOpacity>
            </View>
          </Reveal>
        </>
      )}
    </View>
  );
}
