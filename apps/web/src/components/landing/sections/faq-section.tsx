import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { landingColors, landingTypography } from '../../../theme/landing-tokens';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

interface FaqSectionProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const FaqSection = ({ audience, onLayout, onReveal }: FaqSectionProps) => {
  const content = LANDING_CONTENT[audience].faq;
  const [openIndex, setOpenIndex] = useState<number>(0);

  return (
    <LandingSectionShell
      id="faq"
      testID={`landing-${audience}-faq`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <View style={styles.list}>
        {content.entries.map((entry, index) => {
          const expanded = openIndex === index;
          return (
            <View key={entry.question} style={styles.item}>
              <Pressable
                testID={`landing-${audience}-faq-question-${index}`}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={entry.question}
                onPress={() => setOpenIndex(expanded ? -1 : index)}
                style={styles.questionRow}
                {...({ 'aria-expanded': expanded } as any)}
              >
                <Text style={styles.question}>{entry.question}</Text>
                {expanded ? <Minus size={17} color={landingColors.brand} /> : <Plus size={17} color={landingColors.brand} />}
              </Pressable>
              {expanded && (
                <Text testID={`landing-${audience}-faq-answer-${index}`} style={styles.answer}>{entry.answer}</Text>
              )}
            </View>
          );
        })}
      </View>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: landingColors.border },
  item: { borderBottomWidth: 1, borderBottomColor: landingColors.border, paddingBottom: 4 },
  questionRow: { minHeight: 64, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  question: { flex: 1, color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  answer: { maxWidth: 720, paddingBottom: 20, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
});
