import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Laptop, Smartphone, Tablet } from 'lucide-react-native';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { ProductPreview } from '../product-preview';
import { LandingSectionShell } from './section-shell';

interface DeviceShowcaseProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const DeviceShowcase = ({ audience, onLayout, onReveal }: DeviceShowcaseProps) => {
  const content = LANDING_CONTENT[audience].devices;
  const { width } = useWindowDimensions();
  const isRow = width >= landingLayout.desktopBreakpoint;
  const variant = audience === 'client' ? 'client' : 'owner';

  const devices = [
    { id: 'phone', label: 'Celular', Icon: Smartphone, ratio: 9 / 16, style: styles.phone },
    { id: 'tablet', label: 'Tablet', Icon: Tablet, ratio: 3 / 4, style: styles.tablet },
    { id: 'desktop', label: 'Desktop', Icon: Laptop, ratio: 16 / 10, style: styles.desktop },
  ] as const;

  return (
    <LandingSectionShell
      id="devices"
      testID={`landing-${audience}-devices`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <View style={[styles.row, !isRow && styles.rowStacked]}>
        {devices.map((device) => (
          <View key={device.id} testID={`landing-${audience}-device-${device.id}`} style={[styles.deviceCell, isRow && device.style]}>
            <View style={styles.deviceLabelRow}>
              <device.Icon size={15} color={landingColors.brand} />
              <Text style={styles.deviceLabel}>{device.label}</Text>
            </View>
            <ProductPreview
              variant={audience === 'business' && device.id === 'phone' ? 'professional' : variant}
              aspectRatio={device.ratio}
              accessibilityLabel={`Prévia ilustrativa do CutSync em ${device.label.toLocaleLowerCase('pt-BR')}`}
              style={styles.preview}
            />
          </View>
        ))}
      </View>
      <Text testID={`landing-${audience}-devices-note`} style={styles.note}>{content.note}</Text>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 20 },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 30 },
  deviceCell: { flex: 1, minWidth: 0, gap: 12 },
  phone: { maxWidth: 220 },
  tablet: { maxWidth: 320 },
  desktop: { flex: 2 },
  deviceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceLabel: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12, letterSpacing: 1.2 },
  preview: { width: '100%', borderRadius: landingRadii.lg },
  note: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 19 },
});
