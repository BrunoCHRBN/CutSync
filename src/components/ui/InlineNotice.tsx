import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { colors, radii, typography } from '../../theme/tokens';

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

interface InlineNoticeProps {
  title?: string;
  message: string;
  testID?: string;
  tone?: NoticeTone;
  action?: ReactNode;
}

const config = {
  info: { color: colors.info, background: colors.infoSoft, Icon: Info },
  success: { color: colors.success, background: colors.successSoft, Icon: CircleCheck },
  warning: { color: colors.warning, background: colors.warningSoft, Icon: CircleAlert },
  danger: { color: colors.danger, background: colors.dangerSoft, Icon: CircleAlert },
};

export const InlineNotice = ({ title, message, testID = 'inline-notice', tone = 'info', action }: InlineNoticeProps) => {
  const { color, background, Icon } = config[tone];
  return (
    <View testID={testID} style={[styles.container, { backgroundColor: background, borderColor: `${color}44` }]}>
      <Icon color={color} size={18} />
      <View style={styles.copy}>
        {!!title && <Text style={[styles.title, { color }]}>{title}</Text>}
        <Text style={styles.message}>{message}</Text>
      </View>
      {action}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 13,
  },
  copy: { flex: 1 },
  title: { fontFamily: typography.bodyStrong, fontSize: 11, marginBottom: 3 },
  message: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
});
