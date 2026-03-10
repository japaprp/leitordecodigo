import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';
import { UserRole } from '../../core/types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type TenantPreset = {
  label: string;
  tenantId: string;
  licenseKey: string;
};

const PRESETS: TenantPreset[] = [
  { label: 'Lanchonete', tenantId: 'lanchonete_demo', licenseKey: 'LANCH-2026' },
  { label: 'Hort Fruit', tenantId: 'hortfruit_demo', licenseKey: 'HORT-2026' },
  { label: 'Painel ADM', tenantId: 'admin_hub', licenseKey: 'ADM-ROOT-2026' },
];

export function LoginScreen({ navigation }: Props) {
  const [tenantId, setTenantId] = useState('lanchonete_demo');
  const [licenseKey, setLicenseKey] = useState('LANCH-2026');
  const [name, setName] = useState('Yago');
  const [password, setPassword] = useState('123456');
  const [role, setRole] = useState<UserRole>('cashier');
  const [error, setError] = useState('');
  const login = useAppStore((s) => s.login);

  const canSubmit = useMemo(() => {
    return !!tenantId.trim() && !!licenseKey.trim() && !!name.trim() && !!password.trim();
  }, [tenantId, licenseKey, name, password]);

  const applyPreset = (preset: TenantPreset) => {
    setTenantId(preset.tenantId);
    setLicenseKey(preset.licenseKey);
    if (preset.tenantId === 'admin_hub') {
      setRole('admin');
    }
    setError('');
  };

  const submit = async () => {
    if (!canSubmit) {
      setError('Preencha os campos obrigatorios.');
      return;
    }

    setError('');
    try {
      await login({ tenantId, licenseKey, name, password, role });
      if (role === 'admin') {
        navigation.replace('AdminDashboard');
        return;
      }
      navigation.replace('Session');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha no login.';
      setError(message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 18 }}>
      <Text style={styles.title}>Leitor Auxiliar de PDV</Text>
      <Text style={styles.subtitle}>Acesso por empresa, operador e perfil.</Text>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Cliente</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={[styles.row, { marginBottom: 10 }]}> 
            {PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={[styles.chip, tenantId === preset.tenantId ? styles.chipActive : undefined]}
                onPress={() => applyPreset(preset)}
              >
                <Text style={styles.chipText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TextInput
          style={styles.input}
          placeholder="ID do cliente (tenant)"
          placeholderTextColor="#7f95b7"
          value={tenantId}
          onChangeText={setTenantId}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Chave da licenca"
          placeholderTextColor="#7f95b7"
          value={licenseKey}
          onChangeText={setLicenseKey}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Operador</Text>
        <TextInput style={styles.input} placeholder="Nome do operador" placeholderTextColor="#7f95b7" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#7f95b7" secureTextEntry value={password} onChangeText={setPassword} />
        <View style={[styles.row, { marginBottom: 6 }]}> 
          {(['cashier', 'waiter', 'manager', 'admin'] as const).map((r) => (
            <TouchableOpacity key={r} style={[styles.button, role === r ? styles.buttonOk : undefined, { flex: 1 }]} onPress={() => setRole(r)}>
              <Text style={styles.buttonText}>{r === 'cashier' ? 'Caixa' : r === 'waiter' ? 'Garcom' : r === 'manager' ? 'Gestor' : 'ADM'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={[styles.button, styles.buttonOk, { opacity: canSubmit ? 1 : 0.65 }]} onPress={submit} disabled={!canSubmit}>
        <Text style={styles.buttonText}>Entrar</Text>
      </TouchableOpacity>

      {!!error ? (
        <View style={[styles.badge, styles.badgeDanger, { marginTop: 10 }]}> 
          <Text style={styles.badgeText}>{error}</Text>
        </View>
      ) : null}

      <Text style={{ color: '#aac0df', marginTop: 12, fontSize: 12 }}>
        Exemplo: lanchonete_demo / LANCH-2026 | hortfruit_demo / HORT-2026 | admin_hub / ADM-ROOT-2026
      </Text>
    </ScrollView>
  );
}
