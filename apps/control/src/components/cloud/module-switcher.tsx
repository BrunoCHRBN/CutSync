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
  areasVisibleTo,
  type CloudArea,
} from '@/navigation/cloud-area-registry';
import {
  resolveActiveNavModule,
  type CloudNavModuleId,
} from '@/navigation/module-nav';
import { cloudTheme } from '@/theme/cloud-components';

const accentSoft = {
  brand: cloudTheme.colors.brandSoft,
  blue: cloudTheme.colors.accentBlueSoft,
  green: cloudTheme.colors.accentGreenSoft,
  violet: cloudTheme.colors.accentVioletSoft,
  amber: cloudTheme.colors.accentAmberSoft,
} as const;

const accentStrong = {
  brand: cloudTheme.colors.brand,
  blue: cloudTheme.colors.accentBlue,
  green: cloudTheme.colors.accentGreen,
  violet: cloudTheme.colors.accentViolet,
  amber: cloudTheme.colors.accentAmber,
} as const;

export function ModuleSwitcher({
  onNavigate,
  alertCounts,
}: {
  onNavigate?: () => void;
  alertCounts?: Partial<Record<Exclude<CloudNavModuleId, 'central'>, number>>;
}) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { can } = useControlAuth();
  const [open, setOpen] = React.useState(false);
  const areas = areasVisibleTo(can, { includeCentral: true });
  const active = resolveActiveNavModule(pathname);
  const compact = width < cloudTheme.layout.compactBreakpoint;
  const triggerRef = React.useRef<View>(null);

  const close = React.useCallback(() => setOpen(false), []);

  const handleSelect = React.useCallback(() => {
    close();
    onNavigate?.();
  }, [close, onNavigate]);

  React.useEffect(() => {
    close();
  }, [pathname, close]);

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  return (
    <View ref={triggerRef} style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Área atual: ${active.label}. Alternar área`}
        accessibilityState={{ expanded: open }}
        accessibilityHint="Abre o seletor de áreas"
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [
          styles.trigger,
          open && styles.triggerOpen,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.triggerCopy}>
          <Text style={styles.triggerEyebrow}>ÁREA</Text>
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
        <View style={[styles.modalRoot, compact && styles.modalRootCompact]}>
          <Pressable
            accessibilityLabel="Fechar seletor de áreas"
            accessibilityRole="button"
            onPress={close}
            style={[styles.backdrop, !compact && styles.backdropDesktop]}
          />
          <View
            accessibilityRole="menu"
            style={[styles.panel, compact ? styles.panelCompact : styles.panelDesktop]}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Alternar área</Text>
              {compact ? (
                <Pressable
                  accessibilityLabel="Fechar"
                  accessibilityRole="button"
                  onPress={close}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                >
                  <Text style={styles.closeButtonText}>Fechar</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.list}>
              {areas.map((area) => (
                <AreaMenuItem
                  key={area.id}
                  area={area}
                  selected={area.id === active.id}
                  alertCount={
                    area.id === 'central'
                      ? 0
                      : (alertCounts?.[area.id] ?? 0)
                  }
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

function AreaMenuItem({
  area,
  selected,
  alertCount,
  onPress,
}: {
  area: CloudArea;
  selected: boolean;
  alertCount: number;
  onPress: () => void;
}) {
  const soft = accentSoft[area.accent];
  const strong = accentStrong[area.accent];
  const showBadge = alertCount > 0;

  return (
    <Link href={area.href as never} asChild>
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ selected }}
        accessibilityLabel={[
          `Abrir área ${area.label}`,
          area.shortDescription,
          selected ? 'área atual' : null,
          showBadge ? `${alertCount} avisos` : null,
        ].filter(Boolean).join('. ')}
        onPress={onPress}
        style={({ pressed }) => [
          styles.item,
          selected && styles.itemSelected,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.itemIcon, { backgroundColor: soft }]}>
          <Text style={[styles.itemIconText, { color: strong }]}>
            {area.label.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.itemCopy}>
          <Text style={[styles.itemLabel, selected && styles.itemLabelSelected]}>
            {area.label}
          </Text>
          <Text style={styles.itemHint}>{area.shortDescription}</Text>
        </View>
        {showBadge ? (
          <View style={[styles.badge, { backgroundColor: soft }]}>
            <Text style={[styles.badgeText, { color: strong }]}>
              {alertCount > 99 ? '99+' : String(alertCount)}
            </Text>
          </View>
        ) : null}
        {selected ? (
          <Text style={styles.check} accessibilityElementsHidden>✓</Text>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    minWidth: 148,
    maxWidth: 220,
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
  modalRootCompact: {
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(23, 35, 28, 0.35)',
  },
  backdropDesktop: {
    backgroundColor: 'transparent',
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
    width: 380,
    maxWidth: '92%',
    marginTop: 68,
    marginLeft: 132,
    borderRadius: cloudTheme.radii.md,
    shadowColor: '#17231C',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  panelCompact: {
    width: '100%',
    maxHeight: '78%',
    borderTopLeftRadius: cloudTheme.radii.xl,
    borderTopRightRadius: cloudTheme.radii.xl,
    borderBottomWidth: 0,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingTop: cloudTheme.spacing.lg,
    paddingBottom: cloudTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
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
    minHeight: 52,
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
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: cloudTheme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconText: {
    fontSize: 14,
    fontWeight: '800',
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
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  check: {
    color: cloudTheme.colors.brand,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: { opacity: 0.86 },
});
