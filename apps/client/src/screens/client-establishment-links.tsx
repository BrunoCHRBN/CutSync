import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  ClientSettingsPage,
  SettingsButton,
  SettingsCard,
  SettingsNotice,
  SettingsSectionLabel,
  settingsColors,
} from '@/components/settings/client-settings-ui';
import { useSession } from '@/contexts/session-context';
import {
  type ClientEstablishmentLinkAction,
} from '@/features/establishment-links/client-establishment-links-contract';
import { useClientEstablishmentLinks } from '@/features/establishment-links/use-client-establishment-links';

export function ClientEstablishmentLinksScreen() {
  const { user } = useSession();
  const linksQuery = useClientEstablishmentLinks(user?.id ?? null);
  const { associated, pending } = useMemo(() => ({
    associated: linksQuery.links.filter((link) => link.status === 'confirmed'),
    pending: linksQuery.links.filter((link) => link.status === 'pending'),
  }), [linksQuery.links]);

  const submitResponse = async (action: ClientEstablishmentLinkAction, linkId: string) => {
    linksQuery.resetResponse();
    try {
      await linksQuery.respond({ action, linkId });
    } catch {
      // The mutation exposes a sanitized, user-facing error below.
    }
  };

  const confirmRejection = (linkId: string, establishmentName: string) => {
    Alert.alert(
      'Rejeitar solicitação?',
      `O cadastro de ${establishmentName} não será associado à sua conta e este candidato não será reapresentado automaticamente.`,
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Rejeitar',
          style: 'destructive',
          onPress: () => { void submitResponse('reject', linkId); },
        },
      ],
    );
  };

  return (
    <ClientSettingsPage
      testID="client-establishment-links-screen"
      description="Veja os estabelecimentos associados à sua identidade CutSync e decida sobre cada nova solicitação. O consentimento é separado por unidade."
    >
      {linksQuery.isLoading ? (
        <SettingsNotice
          testID="client-establishment-links-loading"
          tone="neutral"
          message="Carregando seus vínculos…"
        />
      ) : null}

      {linksQuery.error ? (
        <SettingsCard>
          <SettingsNotice
            testID="client-establishment-links-error"
            message={linksQuery.error}
          />
          <SettingsButton
            testID="client-establishment-links-retry"
            label="Tentar novamente"
            tone="secondary"
            loading={linksQuery.isRefreshing}
            onPress={() => { void linksQuery.refresh(); }}
          />
        </SettingsCard>
      ) : null}

      {linksQuery.response ? (
        <SettingsNotice
          testID="client-establishment-links-success"
          tone="success"
          message={linksQuery.response.status === 'confirmed'
            ? 'Vínculo confirmado para este estabelecimento.'
            : 'Solicitação rejeitada. Este candidato não será reapresentado automaticamente.'}
        />
      ) : null}

      {linksQuery.responseError ? (
        <SettingsNotice
          testID="client-establishment-links-response-error"
          message={linksQuery.responseError}
        />
      ) : null}

      <SettingsSectionLabel>SOLICITAÇÕES PENDENTES</SettingsSectionLabel>
      {pending.length === 0 && !linksQuery.isLoading && !linksQuery.error ? (
        <SettingsNotice
          testID="client-establishment-links-pending-empty"
          tone="neutral"
          message="Nenhuma solicitação aguardando sua decisão."
        />
      ) : null}
      {pending.map((link) => {
        const isCurrent = linksQuery.respondingTo?.linkId === link.linkId;
        return (
          <SettingsCard key={link.linkId}>
            <View testID={`client-establishment-link-pending-${link.linkId}`} style={styles.linkCopy}>
              <Text style={styles.establishmentName}>{link.establishmentName}</Text>
              <Text style={styles.linkDescription}>
                A unidade encontrou um cadastro local identificado como {link.clientDisplayName}.
                Confirme apenas se você reconhece esta relação.
              </Text>
            </View>
            <View style={styles.actions}>
              <View style={styles.action}>
                <SettingsButton
                  testID={`client-establishment-link-reject-${link.linkId}`}
                  label="Rejeitar"
                  tone="danger"
                  disabled={linksQuery.isResponding}
                  loading={isCurrent && linksQuery.respondingTo?.action === 'reject'}
                  onPress={() => confirmRejection(link.linkId, link.establishmentName)}
                />
              </View>
              <View style={styles.action}>
                <SettingsButton
                  testID={`client-establishment-link-confirm-${link.linkId}`}
                  label="Confirmar"
                  disabled={linksQuery.isResponding}
                  loading={isCurrent && linksQuery.respondingTo?.action === 'confirm'}
                  onPress={() => { void submitResponse('confirm', link.linkId); }}
                />
              </View>
            </View>
          </SettingsCard>
        );
      })}

      <SettingsSectionLabel>ESTABELECIMENTOS ASSOCIADOS</SettingsSectionLabel>
      {associated.length === 0 && !linksQuery.isLoading && !linksQuery.error ? (
        <SettingsNotice
          testID="client-establishment-links-associated-empty"
          tone="neutral"
          message="Sua conta ainda não possui estabelecimentos associados."
        />
      ) : null}
      {associated.length > 0 ? (
        <SettingsCard>
          <View testID="client-establishment-links-associated-list" style={styles.associatedList}>
            {associated.map((link, index) => (
              <View key={link.linkId}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.associatedRow}>
                  <View style={styles.associatedCopy}>
                    <Text style={styles.establishmentName}>{link.establishmentName}</Text>
                    <Text style={styles.linkDescription}>Vínculo confirmado para esta unidade.</Text>
                  </View>
                  <Text style={styles.confirmedLabel}>ASSOCIADO</Text>
                </View>
              </View>
            ))}
          </View>
        </SettingsCard>
      ) : null}

      <SettingsNotice
        tone="neutral"
        message="Confirmar um vínculo permite que futuros atendimentos compatíveis desta unidade sejam associados à sua conta. A decisão não vale para outros estabelecimentos."
      />
    </ClientSettingsPage>
  );
}

const styles = StyleSheet.create({
  linkCopy: { gap: 6 },
  establishmentName: { color: settingsColors.text, fontSize: 16, fontWeight: '800' },
  linkDescription: { color: settingsColors.secondary, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  associatedList: { gap: 14 },
  associatedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  associatedCopy: { flex: 1, gap: 4 },
  confirmedLabel: {
    color: settingsColors.accent,
    backgroundColor: settingsColors.accentSoft,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  divider: { height: 1, backgroundColor: settingsColors.border, marginBottom: 14 },
});
