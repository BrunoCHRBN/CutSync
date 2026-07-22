import React from 'react';
import { ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { landingRadii, landingShadows } from '../../theme/landing-tokens';
import { GlassSurface, TiltCard } from './motion/landing-effects';

export interface ProductPreviewProps {
  variant: 'client' | 'owner' | 'professional';
  screenshotSrc?: ImageSourcePropType;
  accessibilityLabel: string;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
}

const previewCopy = {
  client: { title: 'Agende sem espera', accent: '#4C7B63', soft: '#E6EFE9' },
  owner: { title: 'Gestão em foco', accent: '#315946', soft: '#E1EBE5' },
  professional: { title: 'Agenda do dia', accent: '#9B7842', soft: '#F4EBDC' },
} as const;

export const ProductPreview = ({
  variant,
  screenshotSrc,
  accessibilityLabel,
  aspectRatio = 16 / 10,
  style,
}: ProductPreviewProps) => {
  const copy = previewCopy[variant];
  return (
    <TiltCard style={style} testID={`landing-preview-${variant}`}>
      <GlassSurface variant="preview" style={[styles.frame, landingShadows.raised]}>
        <View
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          style={{ width: '100%', aspectRatio }}
        >
          {screenshotSrc ? (
            <Image source={screenshotSrc} style={styles.image} contentFit="cover" transition={180} />
          ) : (
            <Svg width="100%" height="100%" viewBox="0 0 800 500" role="img">
              <Rect width="800" height="500" fill="#F9F8F4" />
              <Rect x="22" y="20" width="756" height="54" rx="16" fill="#FFFFFF" stroke="#DDE1DB" />
              <Circle cx="50" cy="47" r="12" fill={copy.accent} />
              <SvgText x="73" y="53" fontSize="17" fontWeight="700" fill="#183027">CutSync</SvgText>
              <SvgText x="625" y="52" fontSize="12" fill="#6E7A72">DEMONSTRAÇÃO</SvgText>
              <Rect x="22" y="94" width="206" height="384" rx="22" fill="#FFFFFF" stroke="#DDE1DB" />
              <SvgText x="46" y="134" fontSize="12" letterSpacing="1.5" fill="#718078">VISÃO {variant === 'client' ? 'CLIENTE' : variant === 'owner' ? 'DO DONO' : 'PROFISSIONAL'}</SvgText>
              <SvgText x="46" y="174" fontSize="23" fontWeight="700" fill="#193328">{copy.title}</SvgText>
              {[0, 1, 2, 3].map((item) => (
                <React.Fragment key={item}>
                  <Rect x="46" y={208 + item * 54} width="156" height="38" rx="11" fill={item === 0 ? copy.soft : '#F4F5F1'} />
                  <Circle cx="64" cy={227 + item * 54} r="6" fill={item === 0 ? copy.accent : '#B9C1BB'} />
                  <Line x1="80" y1={222 + item * 54} x2="178" y2={222 + item * 54} stroke="#A7B0AA" strokeWidth="5" strokeLinecap="round" />
                  <Line x1="80" y1={233 + item * 54} x2="146" y2={233 + item * 54} stroke="#D2D7D2" strokeWidth="4" strokeLinecap="round" />
                </React.Fragment>
              ))}
              <Rect x="248" y="94" width="530" height="384" rx="22" fill="#FFFFFF" stroke="#DDE1DB" />
              <SvgText x="278" y="137" fontSize="14" fontWeight="700" fill="#193328">{variant === 'client' ? 'Escolha seu melhor horário' : 'Resumo da operação'}</SvgText>
              <Rect x="278" y="160" width="470" height="92" rx="17" fill={copy.soft} />
              <Path d="M305 222 C355 183, 404 226, 450 189 C510 142, 568 217, 622 178 C662 149, 700 178, 724 165" fill="none" stroke={copy.accent} strokeWidth="5" strokeLinecap="round" />
              <Circle cx="622" cy="178" r="7" fill={copy.accent} />
              {[0, 1, 2].map((item) => (
                <Rect key={item} x={278 + item * 158} y="274" width="142" height="86" rx="16" fill="#F6F6F2" stroke="#E2E4DF" />
              ))}
              <SvgText x="296" y="305" fontSize="11" fill="#718078">{variant === 'client' ? 'SERVIÇO' : 'INDICADOR'}</SvgText>
              <SvgText x="296" y="337" fontSize="21" fontWeight="700" fill="#193328">{variant === 'client' ? 'Corte' : '74%'}</SvgText>
              <SvgText x="454" y="305" fontSize="11" fill="#718078">{variant === 'client' ? 'DURAÇÃO' : 'AGENDA'}</SvgText>
              <SvgText x="454" y="337" fontSize="21" fontWeight="700" fill="#193328">{variant === 'client' ? '40 min' : '12'}</SvgText>
              <SvgText x="612" y="305" fontSize="11" fill="#718078">{variant === 'client' ? 'STATUS' : 'EQUIPE'}</SvgText>
              <SvgText x="612" y="337" fontSize="19" fontWeight="700" fill="#193328">Ativo</SvgText>
              <Rect x="278" y="382" width="470" height="64" rx="16" fill="#294B3A" />
              <SvgText x="513" y="421" textAnchor="middle" fontSize="15" fontWeight="700" fill="#FFFFFF">Explorar demonstração</SvgText>
            </Svg>
          )}
        </View>
      </GlassSurface>
    </TiltCard>
  );
};

const styles = StyleSheet.create({
  frame: { borderRadius: landingRadii.xl, padding: 10 },
  image: { width: '100%', height: '100%', borderRadius: landingRadii.lg },
});
