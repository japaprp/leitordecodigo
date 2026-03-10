import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { styles } from '../../core/theme';
import { useAppStore } from '../../core/store';

type Props = NativeStackScreenProps<RootStackParamList, 'Session'>;

export function SessionScreen({ navigation }: Props) {
  const tenant = useAppStore((s) => s.tenant);
  const operator = useAppStore((s) => s.operator);
  const [storeId, setStoreId] = useState('1');
  const [sessionId, setSessionId] = useState('');
  const setSession = useAppStore((s) => s.setSession);

  const blocked = tenant?.licenseStatus !== 'active';

  const profile = useMemo(() => {
    if (operator?.role === 'cashier') {
      return {
        title: 'Janela do Caixa',
        subtitle: 'Configure loja e caixa para iniciar leitura e fechamento.',
        sessionHint: 'Ex: caixa-01',
        suggestedSession: 'caixa-01',
      };
    }

    if (operator?.role === 'waiter') {
      return {
        title: 'Janela do Garcom',
        subtitle: 'Configure loja e sessao de atendimento/comanda.',
        sessionHint: 'Ex: atendimento-01',
        suggestedSession: 'atendimento-01',
      };
    }

    return {
      title: 'Janela da Gestao',
      subtitle: 'Configure o contexto para supervisao e ajustes operacionais.',
      sessionHint: 'Ex: gestao-01',
      suggestedSession: 'gestao-01',
    };
  }, [operator?.role]);

  const effectiveSessionId = sessionId.trim() || profile.suggestedSession;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{profile.title}</Text>
      <Text style={styles.subtitle}>Cliente: {tenant?.tenantName || '-'} ({tenant?.tenantId || '-'})</Text>
      <Text style={styles.subtitle}>{profile.subtitle}</Text>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Contexto operacional</Text>
        <TextInput style={styles.input} value={storeId} onChangeText={setStoreId} placeholder="Loja" placeholderTextColor="#7f95b7" editable={!blocked} />
        <TextInput
          style={styles.input}
          value={sessionId}
          onChangeText={setSessionId}
          placeholder={profile.sessionHint}
          placeholderTextColor="#7f95b7"
          editable={!blocked}
        />

        {!sessionId.trim() ? (
          <View style={[styles.badge, styles.badgeInfo]}>
            <Text style={styles.badgeText}>Sessao sugerida: {profile.suggestedSession}</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.button, blocked ? styles.buttonDanger : styles.buttonOk, { opacity: blocked ? 0.7 : 1 }]}
        disabled={blocked}
        onPress={() => {
          setSession({ storeId: storeId.trim() || '1', sessionId: effectiveSessionId });
          navigation.replace('Mode');
        }}
      >
        <Text style={styles.buttonText}>{blocked ? 'Licenca bloqueada' : 'Continuar'}</Text>
      </TouchableOpacity>
    </View>
  );
}
