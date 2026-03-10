import React, { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useNetInfo } from '@react-native-community/netinfo';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { SessionScreen } from './src/features/session/SessionScreen';
import { ModeScreen } from './src/features/mode/ModeScreen';
import { ScannerScreen } from './src/features/scanner/ScannerScreen';
import { StockScreen } from './src/features/stock/StockScreen';
import { WaiterScreen } from './src/features/waiter/WaiterScreen';
import { ReviewScreen } from './src/features/review/ReviewScreen';
import { CloseTableScreen } from './src/features/close/CloseTableScreen';
import { HistoryScreen } from './src/features/history/HistoryScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { AdminDashboardScreen } from './src/features/admin/AdminDashboardScreen';
import { RootStackParamList } from './src/navigation/types';
import { initDb } from './src/data/storage/localDb';
import { useAppStore } from './src/core/store';

initDb();

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#08152a',
    card: '#10274a',
    text: '#eef4ff',
    border: '#27446f',
    primary: '#1ba866',
  },
};

export default function App() {
  const operator = useAppStore((s) => s.operator);
  const tenantId = useAppStore((s) => s.tenant?.tenantId);
  const pendingCount = useAppStore((s) => s.pendingCount);
  const syncState = useAppStore((s) => s.syncState);
  const lastSyncAt = useAppStore((s) => s.lastSyncAt);
  const logout = useAppStore((s) => s.logout);
  const syncPending = useAppStore((s) => s.syncPending);
  const refreshPendingCount = useAppStore((s) => s.refreshPendingCount);
  const netInfo = useNetInfo();

  useEffect(() => {
    refreshPendingCount();
  }, [tenantId, refreshPendingCount]);

  useEffect(() => {
    if (!tenantId) return;

    const executeSync = async () => {
      if (!netInfo.isConnected) return;
      if (pendingCount > 0) {
        await syncPending();
      }
    };

    executeSync();
    const timer = setInterval(executeSync, 15000);
    return () => clearInterval(timer);
  }, [tenantId, netInfo.isConnected, pendingCount, syncPending]);

  const profileLabel = operator?.role === 'cashier' ? 'Caixa' : operator?.role === 'waiter' ? 'Garcom' : operator?.role === 'manager' ? 'Gestao' : operator?.role === 'admin' ? 'ADM' : '-';

  const syncLabel = !netInfo.isConnected
    ? `Offline${pendingCount > 0 ? ` | ${pendingCount} pendente(s)` : ''}`
    : syncState === 'syncing'
      ? `Sincronizando... ${pendingCount > 0 ? `(${pendingCount})` : ''}`
      : pendingCount > 0
        ? `${pendingCount} pendente(s) para sincronizar`
        : `Sincronizado${lastSyncAt ? ` às ${new Date(lastSyncAt).toLocaleTimeString()}` : ''}`;

  const syncColor = !netInfo.isConnected
    ? '#f0b84f'
    : syncState === 'syncing'
      ? '#4aa8ff'
      : pendingCount > 0
        ? '#f0b84f'
        : '#7bf0b1';

  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="light" />

      {operator ? (
        <View style={{ backgroundColor: '#0f2c55', borderBottomColor: '#2e5e98', borderBottomWidth: 1, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: syncColor, fontWeight: '700', fontSize: 12 }}>{syncLabel} | Perfil: {profileLabel}</Text>
        </View>
      ) : null}

      <Stack.Navigator
        screenOptions={({ navigation, route }) => ({
          headerStyle: { backgroundColor: '#10274a' },
          headerTintColor: '#eef4ff',
          headerRight:
            route.name !== 'Login' && operator
              ? () => (
                  <TouchableOpacity
                    onPress={() => {
                      logout();
                      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                    }}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Text style={{ color: '#ffb4b4', fontWeight: '700' }}>Sair</Text>
                  </TouchableOpacity>
                )
              : undefined,
        })}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
        <Stack.Screen name="Session" component={SessionScreen} options={{ title: 'Loja e Sessao' }} />
        <Stack.Screen name="Mode" component={ModeScreen} options={{ title: 'Setores' }} />
        <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: 'Caixa Scanner' }} />
        <Stack.Screen name="Stock" component={StockScreen} options={{ title: 'Leitura de Estoque' }} />
        <Stack.Screen name="Waiter" component={WaiterScreen} options={{ title: 'Comanda e Cardápio' }} />
        <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Revisão e Envio' }} />
        <Stack.Screen name="CloseTable" component={CloseTableScreen} options={{ title: 'Fechar Mesa' }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Histórico' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Integração' }} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'ADM SaaS' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}



