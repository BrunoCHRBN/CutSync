import React, { ReactNode, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';
import { colors, elevations, radii, typeScale } from '../../theme/tokens';
import { IconButton } from './icon-button';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label: string;
  testID: string;
}

export const ActionMenu = ({ items, label, testID }: ActionMenuProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton testID={`${testID}-trigger`} label={label} onPress={() => setOpen(true)} icon={<MoreHorizontal color={colors.textSecondary} size={19} />} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable testID={`${testID}-backdrop`} style={styles.backdrop} onPress={() => setOpen(false)}>
          <View testID={testID} accessibilityRole="menu" style={styles.menu}>
            {items.map((item) => (
              <Pressable
                key={item.key}
                testID={`${testID}-${item.key}`}
                accessibilityRole="menuitem"
                disabled={item.disabled}
                onPress={() => { setOpen(false); item.onPress(); }}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed, item.disabled && styles.disabled]}
              >
                {item.icon}
                <Text style={[styles.label, item.destructive && styles.destructive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(24,32,27,0.28)' },
  menu: { width: '100%', maxWidth: 320, padding: 8, borderRadius: radii.lg, backgroundColor: colors.surface, ...elevations.overlay },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: radii.md },
  itemPressed: { backgroundColor: colors.surfacePressed },
  label: { ...typeScale.bodyStrong, flex: 1, color: colors.text },
  destructive: { color: colors.danger },
  disabled: { opacity: 0.45 },
});
