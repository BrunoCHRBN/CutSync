import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ArrowRight, Command, Search, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { colors, elevations, layout, radii, spacing, typeScale } from '../../theme/tokens';
import { isEditableCommandTarget } from './command-utils';

export { isEditableCommandTarget } from './command-utils';

export interface AppCommand {
  id: string;
  label: string;
  keywords: string[];
  shortcut?: string;
  roles: ('admin' | 'professional' | 'client')[];
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteContextValue {
  open: () => void;
  register: (owner: string, commands: AppCommand[]) => () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const CommandPaletteProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopBreakpoint;
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const registry = useRef(new Map<string, AppCommand[]>());
  const [registryVersion, setRegistryVersion] = useState(0);

  const register = useCallback((owner: string, commands: AppCommand[]) => {
    registry.current.set(owner, commands);
    setRegistryVersion((value) => value + 1);
    return () => {
      registry.current.delete(owner);
      setRegistryVersion((value) => value + 1);
    };
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);
  const open = useCallback(() => setVisible(true), []);

  const baseCommands = useMemo<AppCommand[]>(() => [
    { id: 'admin-services', label: 'Abrir Serviços', keywords: ['catalogo'], roles: ['admin'], run: () => router.push('/(admin)/services') },
    { id: 'admin-team', label: 'Abrir Equipe', keywords: ['profissionais'], roles: ['admin'], run: () => router.push('/(admin)/team') },
    { id: 'admin-settings', label: 'Abrir Configurações', keywords: ['preferencias', 'marca'], roles: ['admin'], run: () => router.push('/(admin)/settings') },
    { id: 'professional-agenda', label: 'Abrir Agenda', keywords: ['calendario', 'hoje'], roles: ['professional'], run: () => router.push('/(professional)') },
    { id: 'professional-profile', label: 'Abrir Meu perfil', keywords: ['perfil'], roles: ['professional'], run: () => router.push('/(professional)/profile') },
    { id: 'client-explore', label: 'Explorar estabelecimentos', keywords: ['buscar', 'salao'], roles: ['client'], run: () => router.push('/(client)') },
    { id: 'client-appointments', label: 'Abrir Meus agendamentos', keywords: ['agenda', 'historico'], roles: ['client'], run: () => router.push('/(client)/appointments') },
    { id: 'client-settings', label: 'Abrir Configurações', keywords: ['conta', 'perfil', 'telefone', 'negocio'], roles: ['client'], run: () => router.push('/(client)/preferences') },
    { id: 'account-security', label: 'Abrir Segurança da conta', keywords: ['senha', 'conta'], roles: ['admin', 'professional'], run: () => router.push('/security') },
  ], [router]);

  const allCommands = useMemo(() => {
    void registryVersion;
    const role = profile?.role;
    if (!role) return [];
    const merged = new Map<string, AppCommand>();
    baseCommands.forEach((command) => merged.set(command.id, command));
    registry.current.forEach((commands) => commands.forEach((command) => merged.set(command.id, command)));
    return [...merged.values()].filter((command) => command.roles.includes(role));
  }, [baseCommands, profile?.role, registryVersion]);

  const filteredCommands = useMemo(() => {
    const term = normalize(query.trim());
    if (!term || term === '?') return allCommands;
    return allCommands.filter((command) => normalize([command.label, ...command.keywords].join(' ')).includes(term));
  }, [allCommands, query]);

  const runCommand = useCallback((command?: AppCommand) => {
    if (!command || command.disabled) return;
    close();
    command.run();
  }, [close]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !profile) return;
    const handler = (event: KeyboardEvent) => {
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setVisible(true);
        return;
      }
      if (!visible && event.key === '?' && !isEditableCommandTarget(event.target)) {
        event.preventDefault();
        setQuery('?');
        setVisible(true);
        return;
      }
      if (!visible) {
        if (isEditableCommandTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
        const directCommand = allCommands.find((command) => command.shortcut?.length === 1 && command.shortcut.toLowerCase() === event.key.toLowerCase());
        if (directCommand) {
          event.preventDefault();
          runCommand(directCommand);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(filteredCommands.length - 1, current + 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runCommand(filteredCommands[selectedIndex]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [allCommands, close, filteredCommands, profile, runCommand, selectedIndex, visible]);

  useEffect(() => setSelectedIndex(0), [query]);

  const contextValue = useMemo(() => ({ open, register }), [open, register]);

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <Modal animationType="fade" onRequestClose={close} transparent visible={Boolean(profile && visible)}>
        <Pressable accessibilityLabel="Fechar central de comandos" onPress={close} style={[styles.backdrop, !desktop && styles.backdropMobile]}>
          <Pressable
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={[styles.palette, !desktop && styles.paletteMobile]}
            testID="command-palette"
          >
            <View style={styles.searchRow}>
              <Search color={colors.textMuted} size={20} />
              <TextInput
                autoFocus
                onChangeText={setQuery}
                placeholder="Digite um comando ou ação"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.brandPrimary}
                style={styles.input}
                testID="command-palette-input"
                value={query === '?' ? '' : query}
              />
              <Pressable accessibilityLabel="Fechar" onPress={close} style={styles.close}><X color={colors.textPrimary} size={19} /></Pressable>
            </View>
            <View style={styles.helpRow}>
              <Command color={colors.brandPrimary} size={15} />
              <Text style={styles.helpText}>{query === '?' ? 'Atalhos disponíveis' : 'Use ↑ ↓ para navegar e Enter para executar'}</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.results}>
              {filteredCommands.length ? filteredCommands.map((command, index) => {
                const selected = index === selectedIndex;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: command.disabled, selected }}
                    disabled={command.disabled}
                    key={command.id}
                    onHoverIn={() => setSelectedIndex(index)}
                    onPress={() => runCommand(command)}
                    style={[styles.command, selected && styles.commandSelected, command.disabled && styles.commandDisabled]}
                    testID={`command-${command.id}`}
                  >
                    <Text style={styles.commandLabel}>{command.label}</Text>
                    {command.shortcut ? <Text style={styles.shortcut}>{command.shortcut}</Text> : <ArrowRight color={colors.textMuted} size={16} />}
                  </Pressable>
                );
              }) : <View style={styles.empty}><Text style={styles.emptyText}>Nenhum comando encontrado.</Text></View>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </CommandPaletteContext.Provider>
  );
};

export const useCommandRegistration = (owner: string, commands: AppCommand[]) => {
  const context = useContext(CommandPaletteContext);
  useEffect(() => context?.register(owner, commands), [commands, context, owner]);
};

export const useCommandPalette = () => {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error('useCommandPalette deve ser usado dentro de CommandPaletteProvider.');
  return context;
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(24,32,27,0.42)', flex: 1, justifyContent: 'flex-start', padding: 24, paddingTop: 96 },
  backdropMobile: { justifyContent: 'flex-end', padding: 0 },
  palette: { backgroundColor: colors.surface, borderRadius: radii.xl, maxHeight: 620, maxWidth: 680, overflow: 'hidden', width: '100%', ...elevations.overlay },
  paletteMobile: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '82%', paddingBottom: 24 },
  searchRow: { alignItems: 'center', borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 66, paddingHorizontal: spacing.lg },
  input: { ...typeScale.body, color: colors.textPrimary, flex: 1, minHeight: 54, outlineStyle: 'none' } as any,
  close: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  helpRow: { alignItems: 'center', backgroundColor: colors.surfaceMuted, flexDirection: 'row', gap: spacing.sm, minHeight: 38, paddingHorizontal: spacing.lg },
  helpText: { ...typeScale.small, color: colors.textMuted },
  results: { maxHeight: 500, padding: spacing.sm },
  command: { alignItems: 'center', borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md },
  commandSelected: { backgroundColor: colors.brandSecondarySoft },
  commandDisabled: { opacity: 0.42 },
  commandLabel: { ...typeScale.bodyStrong, color: colors.textPrimary, flex: 1 },
  shortcut: { ...typeScale.label, backgroundColor: colors.canvasSubtle, borderColor: colors.borderSubtle, borderRadius: radii.sm, borderWidth: 1, color: colors.textSecondary, minWidth: 36, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 5, textAlign: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  emptyText: { ...typeScale.small, color: colors.textMuted },
});
