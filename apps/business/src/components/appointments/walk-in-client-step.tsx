import { Search } from 'lucide-react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { WalkInChoice } from '@/components/appointments/walk-in-choice';
import { BusinessButton, BusinessNotice } from '@/components/ui/business-ui';
import { businessTheme } from '@/theme/business-theme';

interface ClientOption { id: string; displayName: string }

interface WalkInClientStepProps {
  clients: ClientOption[];
  query: string;
  selectedClientId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  isLoading: boolean;
  error: boolean;
  onQueryChange: (value: string) => void;
  onClientSelect: (id: string) => void;
  onUseNewClient: () => void;
  onClientNameChange: (value: string) => void;
  onClientPhoneChange: (value: string) => void;
  onClientEmailChange: (value: string) => void;
}

export function WalkInClientStep(props: WalkInClientStepProps) {
  const usingNewClient = !props.selectedClientId;
  return (
    <View testID="business-walk-in-client-step" style={styles.section}>
      <View style={styles.searchWrap}>
        <Search color={businessTheme.colors.textMuted} size={19} />
        <TextInput
          testID="business-walk-in-client-search"
          value={props.query}
          onChangeText={props.onQueryChange}
          placeholder="Buscar cliente por nome ou contato"
          placeholderTextColor={businessTheme.colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {props.error ? <BusinessNotice testID="business-walk-in-client-error" tone="danger" message="Não foi possível buscar clientes agora." /> : null}
      {!props.isLoading && props.clients.length > 0 ? (
        <View accessibilityRole="radiogroup" style={styles.list}>
          {props.clients.slice(0, 8).map((client) => (
            <WalkInChoice
              key={client.id}
              testID={`business-walk-in-client-${client.id}`}
              label={client.displayName}
              selected={props.selectedClientId === client.id}
              onPress={() => props.onClientSelect(client.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>OU CADASTRO RÁPIDO</Text>
        <View style={styles.divider} />
      </View>

      {props.selectedClientId ? (
        <BusinessButton testID="business-walk-in-use-new-client" label="Usar novo cliente" variant="secondary" onPress={props.onUseNewClient} />
      ) : (
        <View style={styles.form}>
          <TextInput testID="business-walk-in-client-name" value={props.clientName} onChangeText={props.onClientNameChange} placeholder="Nome do cliente *" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
          <TextInput testID="business-walk-in-client-phone" value={props.clientPhone} onChangeText={props.onClientPhoneChange} placeholder="Telefone" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="phone-pad" style={styles.input} />
          <TextInput testID="business-walk-in-client-email" value={props.clientEmail} onChangeText={props.onClientEmailChange} placeholder="E-mail" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
        </View>
      )}
      {usingNewClient && props.clientName.trim().length === 1 ? (
        <Text testID="business-walk-in-client-name-hint" style={styles.hint}>Digite ao menos 2 caracteres.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.md },
  searchWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised },
  searchInput: { flex: 1, minHeight: 50, color: businessTheme.colors.text, fontSize: 14 },
  list: { gap: businessTheme.spacing.xs },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: businessTheme.colors.border },
  dividerText: { ...businessTheme.typography.eyebrow, color: businessTheme.colors.textMuted },
  form: { gap: businessTheme.spacing.sm },
  input: { minHeight: 52, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text },
  hint: { ...businessTheme.typography.caption, color: businessTheme.colors.warning },
});