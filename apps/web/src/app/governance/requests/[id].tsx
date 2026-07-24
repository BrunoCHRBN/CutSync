import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppButton } from '../../../components/ui/AppButton';
import { AppCard } from '../../../components/ui/AppCard';
import { InlineNotice } from '../../../components/ui/InlineNotice';
import { listGovernanceRequests } from '../../../services/governance-compliance';
import type { GovernanceRequest } from '../../../types/governance-compliance';
import { colors, layout, typography } from '../../../theme/tokens';

export default function GovernanceRequestDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter();
  const [item, setItem] = useState<GovernanceRequest | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { if (!id) return; void listGovernanceRequests({}).then((items) => setItem(items.find((candidate) => candidate.id === id) || null)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a solicitação.')).finally(() => setLoading(false)); }, [id]);
  if (loading) return <ActivityIndicator color={colors.brand} style={styles.loader} />;
  if (error || !item) return <ScrollView contentContainerStyle={styles.page}><InlineNotice tone="danger" message={error || 'Solicitação não encontrada.'} /><AppButton label="Voltar" variant="secondary" onPress={() => router.back()} /></ScrollView>;
  return <ScrollView contentContainerStyle={styles.page}><AppButton label="Voltar para solicitações" variant="ghost" onPress={() => router.back()} /><Text style={styles.eyebrow}>DETALHE DA SOLICITAÇÃO</Text><Text style={styles.title}>{item.name}</Text><AppCard style={styles.card}><Text style={styles.label}>Status</Text><Text style={styles.value}>{item.status}</Text><Text style={styles.label}>Slug</Text><Text style={styles.value}>{item.slug}</Text><Text style={styles.label}>Solicitante</Text><Text style={styles.value}>{item.requester_name} · {item.requester_email}</Text><Text style={styles.label}>Documento mascarado</Text><Text style={styles.value}>{item.masked_document || 'Não informado'}</Text><Text style={styles.label}>Endereço</Text><Text style={styles.value}>{item.address || 'Não informado'}</Text>{item.rejection_reason && <><Text style={styles.label}>Justificativa da rejeição</Text><Text style={styles.value}>{item.rejection_reason}</Text></>}</AppCard></ScrollView>;
}
const styles = StyleSheet.create({ page: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, gap: 16, paddingBottom: 80 }, loader: { margin: 50 }, eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 2 }, title: { color: colors.text, fontFamily: typography.display, fontSize: 32 }, card: { padding: 22, gap: 8, maxWidth: 680 }, label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', marginTop: 8 }, value: { color: colors.text, fontFamily: typography.body, fontSize: 15 } });
