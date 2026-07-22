import React, { useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, Compass, Eye, LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LandingAudience } from './landing-analytics';
import { useLandingMotion, useReducedMotion } from './motion/landing-motion';
import {
  landingColors,
  landingLayout,
  landingMotion,
  landingRadii,
  landingTypography,
} from '../../theme/landing-tokens';

const options: { id: LandingAudience; title: string; description: string; Icon: LucideIcon }[] = [
  { id: 'client', title: 'Quero agendar um serviço', description: 'Encontre estabelecimentos e reserve seu horário.', Icon: Compass },
  { id: 'business', title: 'Quero gerenciar meu negócio', description: 'Conheça a operação, a agenda e a visão da equipe.', Icon: BriefcaseBusiness },
  { id: 'observer', title: 'Estou apenas observando', description: 'Veja as duas experiências no seu ritmo.', Icon: Eye },
];

export const AudienceSelector = ({ value, onChange }: { value: LandingAudience; onChange: (value: LandingAudience) => void }) => {
  const { width } = useWindowDimensions();
  const { quality } = useLandingMotion();
  const reducedMotion = useReducedMotion();
  const [leavingAudience, setLeavingAudience] = useState<LandingAudience | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stacked = width < landingLayout.mobileBreakpoint;

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  const selectAudience = (nextValue: LandingAudience) => {
    if (nextValue === value) return;
    if (!reducedMotion && quality === 'high') {
      setLeavingAudience(value);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => setLeavingAudience(null), landingMotion.standard);
    }
    onChange(nextValue);
  };

  return (
    <View testID="landing-audience-selector" style={styles.section}>
      <Text style={styles.prompt}>O que você quer fazer hoje?</Text>
      <ScrollView horizontal={stacked} showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.options, stacked && styles.optionsScrollable]}>
        {options.map(({ id, title, description, Icon }) => {
          const selected = id === value;
          const leaving = id === leavingAudience && !selected;
          return (
            <Pressable
              key={id}
              testID={`landing-audience-${id}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${title}. ${description}`}
              onPress={() => selectAudience(id)}
              style={({ pressed }) => [
                styles.option,
                stacked && styles.optionScrollable,
                selected && styles.optionSelected,
                !selected && !reducedMotion && ({ opacity: 0.82, filter: 'blur(0px)', transitionDuration: `${landingMotion.standard}ms` } as never),
                leaving && ({ opacity: 0.62, filter: 'blur(3px)', transform: [{ scale: 0.985 }] } as never),
                pressed && styles.optionPressed,
              ]}
            >
              <View style={[styles.icon, selected && styles.iconSelected]}>
                <Icon size={16} color={selected ? landingColors.white : landingColors.brand} strokeWidth={1.8} />
              </View>
              <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { width: '100%', gap: 9 },
  prompt: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  options: { width: '100%', flexGrow: 1, flexDirection: 'row', gap: 8 },
  optionsScrollable: { width: 'auto', paddingRight: 20 },
  option: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: landingRadii.md,
    backgroundColor: landingColors.surface,
    borderWidth: 1,
    borderColor: landingColors.border,
    gap: 9,
  },
  optionScrollable: { flexGrow: 0, flexBasis: 220, width: 220 },
  optionSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand },
  optionPressed: { transform: [{ scale: 0.99 }] },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  iconSelected: { backgroundColor: 'rgba(255,255,255,0.15)' },
  optionTitle: { flex: 1, color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 12, lineHeight: 17 },
  optionTitleSelected: { color: landingColors.white },
});
