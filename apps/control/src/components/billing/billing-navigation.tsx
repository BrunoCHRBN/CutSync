import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { billingStyles as styles } from '@/components/billing/billing-styles';
import type { BillingSection } from '@/components/billing/billing-types';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export interface BillingSectionMeta {
  eyebrow: string;
  title: string;
  description: string;
}

export const billingSectionMetadata: Record<BillingSection, BillingSectionMeta> = {
  overview: {
    eyebrow: 'FINANCEIRO',
    title: 'Visão geral',
    description:
      'Recebido, pendências, conciliação e previsto da cobrança da plataforma. Pagamentos de serviços de clientes permanecem fora deste módulo.',
  },
  plans: {
    eyebrow: 'FINANCEIRO',
    title: 'Assinaturas',
    description:
      'Planos e preço-base usados em novas assinaturas e faturas futuras. Faturas já emitidas preservam seus valores.',
  },
  accounts: {
    eyebrow: 'FINANCEIRO',
    title: 'Cobranças',
    description:
      'Contas, assinaturas e mudanças auditadas de status, fatura e bloqueio.',
  },
  cutovers: {
    eyebrow: 'FINANCEIRO',
    title: 'Conciliação',
    description:
      'Transições e cortes de cobrança após reconciliar assinaturas individuais vigentes.',
  },
  conflicts: {
    eyebrow: 'FINANCEIRO',
    title: 'Conflitos cadastrais',
    description:
      'Analise registros mascarados e documente decisões sem expor documentos pessoais.',
  },
};

const billingNavigation: {
  section: BillingSection;
  label: string;
  href:
    | typeof CLOUD_ROUTES.financeiro.root
    | typeof CLOUD_ROUTES.financeiro.assinaturas
    | typeof CLOUD_ROUTES.financeiro.cobrancas
    | typeof CLOUD_ROUTES.financeiro.conciliacao;
}[] = [
  { section: 'overview', label: 'Visão geral', href: CLOUD_ROUTES.financeiro.root },
  { section: 'plans', label: 'Assinaturas', href: CLOUD_ROUTES.financeiro.assinaturas },
  { section: 'accounts', label: 'Cobranças', href: CLOUD_ROUTES.financeiro.cobrancas },
  { section: 'cutovers', label: 'Conciliação', href: CLOUD_ROUTES.financeiro.conciliacao },
  { section: 'conflicts', label: 'Conflitos', href: CLOUD_ROUTES.financeiro.conciliacao },
];

export function BillingNavigation() {
  const pathname = usePathname();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.navigation}
    >
      {billingNavigation
        .filter((item, index, list) => list.findIndex((entry) => entry.href === item.href) === index)
        .map((item) => {
          const selected = item.href === CLOUD_ROUTES.financeiro.root
            ? pathname === item.href
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
      {billingNavigation
        .filter((item, index, list) => (
          item.section !== 'overview'
          && list.findIndex((entry) => entry.href === item.href) === index
        ))
        .map((item) => (
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
