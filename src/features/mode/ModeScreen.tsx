import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';

type Props = NativeStackScreenProps<RootStackParamList, 'Mode'>;

function roleLabel(role?: 'cashier' | 'waiter' | 'manager' | 'admin') {
  if (role === 'cashier') return 'Caixa';
  if (role === 'waiter') return 'Garcom';
  if (role === 'manager') return 'Gestor';
  if (role === 'admin') return 'ADM SaaS';
  return '-';
}

export function ModeScreen({ navigation }: Props) {
  const setMode = useAppStore((s) => s.setMode);
  const tenant = useAppStore((s) => s.tenant);
  const operator = useAppStore((s) => s.operator);
  const uiProfile = useAppStore((s) => s.uiProfile);
  const canUseMode = useAppStore((s) => s.canUseMode);
  const canUseFeature = useAppStore((s) => s.canUseFeature);

  const scannerEnabled = canUseMode('scanner');
  const stockEnabled = canUseMode('stock');
  const waiterEnabled = canUseMode('table');
  const historyEnabled = canUseFeature('history');
  const tableCloseEnabled = canUseFeature('tableClose');

  const isCashier = operator?.role === 'cashier';
  const isWaiter = operator?.role === 'waiter';
  const isManager = operator?.role === 'manager';
  const isAdmin = operator?.role === 'admin';

  const cashierAllowed = !isAdmin && (isCashier || isManager);
  const waiterAllowed = !isAdmin && (isWaiter || isManager);
  const managementAllowed = !isAdmin && isManager;
  const adminAllowed = isAdmin;

  const cashierReason = !cashierAllowed
    ? 'Perfil atual sem permissao de caixa.'
    : !scannerEnabled
      ? 'Modulo de caixa scanner desativado.'
      : '';

  const stockReason = !cashierAllowed
    ? 'Perfil atual sem permissao de estoque.'
    : !stockEnabled
      ? 'Modulo de estoque desativado neste cliente.'
      : '';

  const waiterReason = !waiterAllowed
    ? 'Perfil atual sem permissao de atendimento.'
    : !waiterEnabled
      ? 'Fluxo de atendimento desativado neste cliente.'
      : '';

  const historyReason = !historyEnabled
    ? 'Historico indisponivel pela licenca/modulo.'
    : isWaiter && !isManager
      ? 'Historico completo reservado para caixa/gestao.'
      : '';

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Janela operacional por setor</Text>
      <Text style={styles.subtitle}>Operador: {operator?.name || '-'} | Perfil: {roleLabel(operator?.role)}</Text>
      <Text style={styles.subtitle}>Cliente: {tenant?.tenantName || '-'} | Tenant: {tenant?.tenantId || '-'}</Text>

      {adminAllowed ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Setor ADM SaaS</Text>
          <Text style={{ color: '#aac0df', marginBottom: 10 }}>
            Cadastro de empresas e liberacao de um ou mais modulos por cliente.
          </Text>
          <TouchableOpacity style={[styles.button, styles.buttonOk]} onPress={() => navigation.navigate('AdminDashboard')}>
            <Text style={styles.buttonText}>Abrir dashboard ADM</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!adminAllowed ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Setor do Caixa</Text>
            <Text style={{ color: '#aac0df', marginBottom: 10 }}>
              Leitura por camera/QR para venda e inventario com envio rapido para o sistema.
            </Text>

            {!!cashierReason ? (
              <View style={[styles.badge, styles.badgeWarn]}>
                <Text style={styles.badgeText}>{cashierReason}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, !cashierReason ? styles.buttonOk : styles.buttonDanger, { opacity: !cashierReason ? 1 : 0.65, marginBottom: 8 }]}
              disabled={!!cashierReason}
              onPress={() => {
                setMode('scanner');
                navigation.navigate('Scanner');
              }}
            >
              <Text style={styles.buttonText}>Abrir {uiProfile.scannerModeLabel.toLowerCase()}</Text>
            </TouchableOpacity>

            {!!stockReason ? (
              <View style={[styles.badge, styles.badgeWarn]}>
                <Text style={styles.badgeText}>{stockReason}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, !stockReason ? styles.buttonOk : styles.buttonDanger, { opacity: !stockReason ? 1 : 0.65, marginBottom: 8 }]}
              disabled={!!stockReason}
              onPress={() => {
                setMode('stock');
                navigation.navigate('Stock');
              }}
            >
              <Text style={styles.buttonText}>Abrir {uiProfile.stockModeLabel.toLowerCase()}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { opacity: cashierAllowed ? 1 : 0.65 }]}
              disabled={!cashierAllowed}
              onPress={() => navigation.navigate('Review')}
            >
              <Text style={styles.buttonText}>Revisar envios do caixa</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Setor do Garcom</Text>
            <Text style={{ color: '#aac0df', marginBottom: 10 }}>
              Atendimento com cardapio/produtos, mesa/comanda e envio para caixa/cozinha.
            </Text>

            {!!waiterReason ? (
              <View style={[styles.badge, styles.badgeWarn]}>
                <Text style={styles.badgeText}>{waiterReason}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, !waiterReason ? styles.buttonOk : styles.buttonDanger, { opacity: !waiterReason ? 1 : 0.65, marginBottom: 8 }]}
              disabled={!!waiterReason}
              onPress={() => {
                setMode('table');
                navigation.navigate('Waiter');
              }}
            >
              <Text style={styles.buttonText}>Abrir atendimento</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonWarn, { opacity: !waiterReason && tableCloseEnabled ? 1 : 0.65 }]}
              disabled={!!waiterReason || !tableCloseEnabled}
              onPress={() => {
                setMode('table');
                navigation.navigate('CloseTable');
              }}
            >
              <Text style={styles.buttonText}>Fechar mesa/comanda</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Setor de Gestao</Text>
            <Text style={{ color: '#aac0df', marginBottom: 10 }}>
              Analise de metricas e configuracao de modulos do cliente dentro do que ADM liberou.
            </Text>

            {!!historyReason ? (
              <View style={[styles.badge, styles.badgeWarn]}>
                <Text style={styles.badgeText}>{historyReason}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, styles.buttonOk, { opacity: !historyReason ? 1 : 0.65, marginBottom: 8 }]}
              disabled={!!historyReason}
              onPress={() => navigation.navigate('History')}
            >
              <Text style={styles.buttonText}>Historico e metricas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, managementAllowed ? undefined : styles.buttonDanger, { opacity: managementAllowed ? 1 : 0.65 }]}
              disabled={!managementAllowed}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.buttonText}>{managementAllowed ? 'Configurar modulos' : 'Configuracao: somente gestor'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.badge, styles.badgeInfo]}>
            <Text style={styles.badgeText}>Nomes ativos: {uiProfile.scannerModeLabel} | {uiProfile.stockModeLabel} | {uiProfile.tableModeLabel}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
