import { Link, usePathname } from 'expo-router';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import {
  modulesForSwitcher,
  resolveActiveNavModule,
  type CloudNavModule,
} from '@/navigation/module-nav';
import { cloudTheme } from '@/theme/cloud-components';

export function ModuleSwitcher({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { can } = useControlAuth();
  const [open, setOpen] = React.useState(false);
  const modules = modulesForSwitcher(can);
  const active = resolveActiveNavModule(pathname);
  const compact = width < cloudTheme.layout.compactBreakpoint;

  const close = React.useCallback(() => setOpen(false), []);

  const handleSelect = React.useCallback(() => {
    close();
    onNavigate?.();
  }, [close, onNavigate]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Módulo atual: ${active.label}. Abrir seletor de módulos`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [
          styles.trigger,
          open && styles.triggerOpen,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.triggerCopy}>
          <Text style={styles.triggerEyebrow}>MÓDULO</Text>
          <Text numberOfLines={1} style={styles.triggerLabel}>{active.label}</Text>
        </View>
        <Text style={styles.chevron} accessibilityElementsHidden>
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      <Modal
        animationType={compact ? 'slide' : 'fade'}
        transparent
        visible={open}
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Fechar seletor de módulos"
            accessibilityRole="button"
            onPress={close}
            style={styles.backdrop}
          />
          <View
            accessibilityRole="menu"
            style={[styles.panel, compact ? styles.panelCompact : styles.panelDesktop]}
          >
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelEyebrow}>CUTSYNC CLOUD</Text>
                <Text style={styles.panelTitle}>Alternar módulo</Text>
              </View>
              <Pressable
                accessibilityLabel="Fechar"
                accessibilityRole="button"
                onPress={close}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <Text style={styles.closeButtonText}>Fechar</Text>
              </Pressable>
            </View>

            <View style={styles.list}>
              {modules.map((module) => (
                <ModuleMenuItem
                  key={module.id}
                  module={module}
                  selected={module.id === active.id}
                  onPress={handleSelect}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ModuleMenuItem({
  module,
  selected,
  onPress,
}: {
  module: CloudNavModule;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Link href={module.href} asChild>
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ selected }}
        accessibilityLabel={`Abrir módulo ${module.label}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.item,
          selected && styles.itemSelected,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.itemMarker, selected && styles.itemMarkerSelected]} />
        <View style={styles.itemCopy}>
          <Text style={[styles.itemLabel, selected && styles.itemLabelSelected]}>
            {module.label}
          </Text>
          <Text style={styles.itemHint}>
            {module.id === 'central'
              ? 'Hub e prioridades'
              : module.id === 'operation'
                ? 'Indicadores e tempo real'
                : module.id === 'support'
                  ? 'Fila e atendimentos'
                  : module.id === 'gsp'
                    ? 'Governança e acessos'
                    : 'Cobrança da plataforma'}
          </Text>
        </View>
        {selected ? <Text style={styles.itemCurrent}>Atual</Text> : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    minWidth: 160,
    maxWidth: 240,
  },
  trigger: {
    minHeight: cloudTheme.layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  triggerOpen: {
    borderColor: cloudTheme.colors.brand,
    backgroundColor: cloudTheme.colors.brandSoft,
  },
  triggerCopy: { flex: 1, minWidth: 0, gap: 1 },
  triggerEyebrow: {
    ...cloudTheme.type.caption,
    color: cloudTheme.colors.textMuted,
    letterSpacing: 0.8,
  },
  triggerLabel: {
    ...cloudTheme.type.button,
    color: cloudTheme.colors.brand,
  },
  chevron: {
    color: cloudTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(23, 35, 28, 0.42)',
  },
  panel: {
    zIndex: 2,
    backgroundColor: cloudTheme.colors.surfaceRaised,
    borderColor: cloudTheme.colors.border,
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelDesktop: {
    alignSelf: 'flex-start',
    width: 360,
    maxWidth: '92%',
    marginTop: 72,
    marginLeft: 148,
    borderRadius: cloudTheme.radii.lg,
    shadowColor: '#17231C',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  panelCompact: {
    marginTop: 'auto',
    width: '100%',
    maxHeight: '78%',
    borderTopLeftRadius: cloudTheme.radii.xl,
    borderTopRightRadius: cloudTheme.radii.xl,
    borderBottomWidth: 0,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingTop: cloudTheme.spacing.lg,
    paddingBottom: cloudTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  panelEyebrow: {
    ...cloudTheme.type.eyebrow,
    color: cloudTheme.colors.accent,
  },
  panelTitle: {
    ...cloudTheme.type.sectionTitle,
    color: cloudTheme.colors.text,
  },
  closeButton: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
  },
  closeButtonText: {
    ...cloudTheme.type.button,
    color: cloudTheme.colors.textSecondary,
  },
  list: {
    padding: cloudTheme.spacing.sm,
    gap: cloudTheme.spacing.xxs,
  },
  item: {
    minHeight: cloudTheme.layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    borderRadius: cloudTheme.radii.md,
  },
  itemSelected: {
    backgroundColor: cloudTheme.colors.brandSoft,
  },
  itemMarker: {
    width: 3,
    height: 28,
    borderRadius: cloudTheme.radii.pill,
    backgroundColor: 'transparent',
  },
  itemMarkerSelected: {
    backgroundColor: cloudTheme.colors.brand,
  },
  itemCopy: { flex: 1, minWidth: 0, gap: 2 },
  itemLabel: {
    ...cloudTheme.type.button,
    color: cloudTheme.colors.text,
  },
  itemLabelSelected: {
    color: cloudTheme.colors.brand,
    fontWeight: '800',
  },
  itemHint: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textMuted,
  },
  itemCurrent: {
    ...cloudTheme.type.caption,
    color: cloudTheme.colors.brand,
    fontWeight: '800',
  },
  pressed: { opacity: 0.86 },
});
