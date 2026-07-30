import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { billingStyles as styles } from '@/components/billing/billing-styles';
import type { BillingSection } from '@/components/billing/billing-types';

export interface BillingSectionMeta {
  eyebrow: string;
  title: string;
  description: string;
}

export const billingSectionMetadata: Record<BillingSection, BillingSectionMeta> = {
  overview: {
    eyebrow: 'ADMINISTRAÇÃO',
    title: 'Cobrança da plataforma',
    description:
      'Visão operacional das assinaturas dos estabelecimentos. Pagamentos de serviços de clientes permanecem fora deste módulo.',
  },
  plans: {
    eyebrow: 'COBRANÇA · PLANOS',
    title: 'Configuração de planos',
    description:
      'Defina o preço-base usado em novas assinaturas e faturas futuras. Faturas já emitidas preservam seus valores.',
  },
  accounts: {
    eyebrow: 'COBRANÇA · CONTAS',
    title: 'Contas e assinaturas',
    description:
      'Consulte organizações, ative assinaturas e execute mudanças auditadas de status, fatura e bloqueio.',
  },
  cutovers: {
    eyebrow: 'COBRANÇA · TRANSIÇÕES',
    title: 'Cortes de cobrança',
    description:
      'Finalize a consolidação multiunidade somente depois de reconciliar assinaturas individuais vigentes.',
  },
  conflicts: {
    eyebrow: 'COBRANÇA · IDENTIDADE',
    title: 'Conflitos cadastrais',
    description:
      'Analise registros mascarados e documente decisões sem expor documentos pessoais.',
  },
};

const billingNavigation: {
  section: BillingSection;
  label: string;
  href: '/billing' | '/billing/plans' | '/billing/accounts' | '/billing/cutovers' | '/billing/conflicts';
}[] = [
  { section: 'overview', label: 'Visão geral', href: '/billing' },
  { section: 'plans', label: 'Planos', href: '/billing/plans' },
  { section: 'accounts', label: 'Contas', href: '/billing/accounts' },
  { section: 'cutovers', label: 'Transições', href: '/billing/cutovers' },
  { section: 'conflicts', label: 'Conflitos', href: '/billing/conflicts' },
];

export function BillingNavigation() {
  const pathname = usePathname();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.navigation}
    >
      {billingNavigation.map((item) => {
        const selected = item.href === '/billing'
          ? pathname === '/billing'
          : pathname.startsWith(item.href);
        return (
          <Link key={item.section} href={item.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={StyleSheet.flatten([
                styles.navigationItem,
                selected && styles.navigationItemSelected,
              ])}
            >
              <Text style={[
                styles.navigationLabel,
                selected && styles.navigationLabelSelected,
              ]}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        );
      })}
    </ScrollView>
  );
}

export function BillingOverviewLinks() {
  return (
    <>
      {billingNavigation.slice(1).map((item) => (
        <Link key={item.section} href={item.href} asChild>
          <Pressable style={styles.overviewLink}>
            <Text style={styles.overviewLinkTitle}>{item.label}</Text>
            <Text style={styles.overviewLinkDetail}>
              Abrir a área de {item.label.toLocaleLowerCase('pt-BR')}.
            </Text>
          </Pressable>
        </Link>
      ))}
    </>
  );
}
