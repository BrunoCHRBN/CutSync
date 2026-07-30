import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CircleCheck, FlaskConical } from 'lucide-react-native';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { LANDING_AVAILABILITY } from '../landing-claims';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

interface ProductTransparencyProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const ProductTransparency = ({ audience, onLayout, onReveal }: ProductTransparencyProps) => {
  const content = LANDING_CONTENT[audience].transparency;
  const { width } = useWindowDimensions();
  const isRow = width >= landingLayout.mobileBreakpoint;
  const entries = LANDING_AVAILABILITY.filter((item) => item.audience === audience || item.audience === 'shared');
  const available = entries.filter((item) => item.state === 'available');
  const validating = entries.filter((item) => item.state === 'validating');

  return (
    <LandingSectionShell
      id="transparency"
      testID={`landing-${audience}-transparency`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <View style={[styles.columns, !isRow && styles.columnsStacked]}>
        <View testID={`landing-${audience}-available-today`} style={[styles.column, styles.columnAvailable]}>
          <View style={styles.columnHead}>
            <CircleCheck size={17} color={landingColors.success} />
            <Text style={styles.columnTitle}>Disponível hoje</Text>
          </View>
          {available.map((item) => (
            <View key={item.id} style={styles.entry}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <Text style={styles.entryText}>{item.description}</Text>
            </View>
          ))}
        </View>
        <View testID={`landing-${audience}-in-validation`} style={[styles.column, styles.columnValidating]}>
          <View style={styles.columnHead}>
            <FlaskConical size={17} color={landingColors.warning} />
            <Text style={styles.columnTitle}>Em validação</Text>
          </View>
          {validating.map((item) => (
            <View key={item.id} style={styles.entry}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <Text style={styles.entryText}>{item.description}</Text>
            </View>
          ))}
          <Text style={styles.validationNote}>Nada desta coluna é oferecido como disponível, nem tem data anunciada.</Text>
        </View>
      </View>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 18 },
  columnsStacked: { flexDirection: 'column' },
  column: { flex: 1, minWidth: 260, padding: 24, gap: 18, borderRadius: landingRadii.lg, borderWidth: 1 },
  columnAvailable: { borderColor: 'rgba(46,113,72,0.28)', backgroundColor: landingColors.successSoft },
  columnValidating: { borderColor: landingColors.warningBorder, backgroundColor: landingColors.warningSoft },
  columnHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  columnTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 19 },
  entry: { gap: 5 },
  entryTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  entryText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 12.5, lineHeight: 19 },
  validationNote: { color: landingColors.warning, fontFamily: landingTypography.bodyMedium, fontSize: 12, lineHeight: 18 },
});
