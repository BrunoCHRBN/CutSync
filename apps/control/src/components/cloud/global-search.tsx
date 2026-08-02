import { Link } from 'expo-router';
import React, { useDeferredValue, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { searchCloudActions } from '@/navigation/module-registry';
import { cloudTheme } from '@/theme/cloud-components';

export function GlobalSearch({
  placeholder = 'Buscar rotas e ações disponíveis',
  onNavigate,
}: {
  placeholder?: string;
  onNavigate?: () => void;
}) {
  const { can } = useControlAuth();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const results = searchCloudActions(deferred, can);

  return (
    <View style={styles.wrap}>
      <TextInput
        accessibilityLabel="Busca global do CutSync Cloud"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={cloudTheme.colors.textMuted}
        style={styles.input}
        value={query}
      />
      {query.trim() ? (
        <View style={styles.results}>
          {results.length === 0 ? (
            <Text style={styles.empty}>Nenhuma ação disponível para sua busca.</Text>
          ) : (
            results.map((action) => (
              <Link key={action.id} href={action.href} asChild>
                <Pressable
                  accessibilityRole="link"
                  onPress={onNavigate}
                  style={({ pressed }) => [styles.result, pressed && styles.pressed]}
                >
                  <Text style={styles.resultLabel}>{action.label}</Text>
                </Pressable>
              </Link>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: cloudTheme.spacing.xs, position: 'relative', zIndex: 2 },
  input: {
    minHeight: cloudTheme.layout.touchTarget,
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
    color: cloudTheme.colors.text,
    fontSize: 14,
  },
  results: {
    gap: 2,
    padding: cloudTheme.spacing.xs,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surfaceRaised,
  },
  result: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    borderRadius: cloudTheme.radii.sm,
  },
  pressed: { backgroundColor: cloudTheme.colors.surfacePressed },
  resultLabel: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  empty: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted, padding: cloudTheme.spacing.sm },
});
