import React, { useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, Compass, Eye, LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
      <Text style={styles.eyebrow}>COMECE DO SEU JEITO</Text>
      <Text style={styles.title}>O que você quer fazer hoje?</Text>
      <View style={[styles.options, stacked && styles.optionsStacked]}>
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
                selected && styles.optionSelected,
                !selected && !reducedMotion && ({ opacity: 0.82, filter: 'blur(0px)', transitionDuration: `${landingMotion.standard}ms` } as never),
                leaving && ({ opacity: 0.62, filter: 'blur(3px)', transform: [{ scale: 0.985 }] } as never),
                pressed && styles.optionPressed,
              ]}
            >
              <View style={[styles.icon, selected && styles.iconSelected]}>
                <Icon size={19} color={selected ? landingColors.white : landingColors.brand} strokeWidth={1.8} />
              </View>
              <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{title}</Text>
              <Text style={[styles.optionDescription, selected && styles.optionDescriptionSelected]}>{description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: 12 },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  title: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 29, lineHeight: 34 },
  options: { flexDirection: 'row', gap: 12 },
  optionsStacked: { flexDirection: 'column' },
  option: {
    flex: 1,
    minHeight: 156,
    padding: 18,
    borderRadius: landingRadii.lg,
    backgroundColor: landingColors.surface,
    borderWidth: 1,
    borderColor: landingColors.border,
    gap: 8,
  },
  optionSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand, transform: [{ scale: 1.015 }] },
  optionPressed: { transform: [{ scale: 0.99 }] },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  iconSelected: { backgroundColor: 'rgba(255,255,255,0.15)' },
  optionTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15, lineHeight: 20 },
  optionTitleSelected: { color: landingColors.white },
  optionDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 19 },
  optionDescriptionSelected: { color: '#DFE8E2' },
});
