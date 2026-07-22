import React from 'react';
import { ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { landingColors, landingRadii, landingShadows } from '../../theme/landing-tokens';
import { GlassSurface, TiltCard } from './motion/landing-effects';

export interface ProductPreviewProps {
  variant: 'client' | 'owner' | 'professional';
  screenshotSrc?: ImageSourcePropType;
  accessibilityLabel: string;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
}

const Header = ({ label }: { label: string }) => (
  <G>
    <Rect x="22" y="20" width="756" height="54" rx="16" fill={landingColors.surface} stroke={landingColors.border} />
    <Circle cx="50" cy="47" r="12" fill={landingColors.brand} />
    <SvgText x="73" y="53" fontSize="17" fontWeight="700" fill={landingColors.ink}>CutSync</SvgText>
    <SvgText x="615" y="52" fontSize="11" fill={landingColors.inkMuted}>{label}</SvgText>
  </G>
);

const ClientPreview = () => (
  <G>
    <Header label="AGENDAMENTO" />
    <Rect x="22" y="94" width="756" height="384" rx="22" fill={landingColors.surface} stroke={landingColors.border} />
    <SvgText x="54" y="135" fontSize="12" letterSpacing="1.4" fill={landingColors.inkMuted}>ESCOLHA COM CLAREZA</SvgText>
    <SvgText x="54" y="171" fontSize="25" fontWeight="700" fill={landingColors.ink}>Reserve seu horário</SvgText>
    <Rect x="54" y="198" width="310" height="54" rx="14" fill={landingColors.surfaceSoft} stroke={landingColors.border} />
    <Circle cx="79" cy="225" r="8" fill={landingColors.brand} />
    <SvgText x="99" y="230" fontSize="14" fill={landingColors.ink}>Corte essencial · 30 min</SvgText>
    <SvgText x="54" y="291" fontSize="12" fontWeight="700" fill={landingColors.ink}>Profissional</SvgText>
    {['Qualquer profissional', 'Profissional A', 'Profissional B'].map((label, index) => (
      <G key={label}>
        <Rect x={54 + index * 148} y="309" width="136" height="48" rx="13" fill={index === 0 ? landingColors.brandSoft : landingColors.surfaceSoft} stroke={index === 0 ? landingColors.brand : landingColors.border} />
        <SvgText x={122 + index * 148} y="338" textAnchor="middle" fontSize="11" fill={landingColors.ink}>{label}</SvgText>
      </G>
    ))}
    <SvgText x="54" y="395" fontSize="12" fontWeight="700" fill={landingColors.ink}>Horários consultados na agenda</SvgText>
    {['09:30', '10:30', '11:00', '14:30'].map((time, index) => (
      <G key={time}>
        <Rect x={54 + index * 92} y="412" width="80" height="42" rx="12" fill={index === 1 ? landingColors.brand : landingColors.surfaceSoft} />
        <SvgText x={94 + index * 92} y="438" textAnchor="middle" fontSize="12" fontWeight="700" fill={index === 1 ? landingColors.white : landingColors.ink}>{time}</SvgText>
      </G>
    ))}
    <Rect x="492" y="124" width="250" height="318" rx="20" fill={landingColors.accentSoft} />
    <Circle cx="617" cy="190" r="35" fill={landingColors.brand} />
    <SvgText x="617" y="196" textAnchor="middle" fontSize="18" fontWeight="700" fill={landingColors.white}>CS</SvgText>
    <SvgText x="617" y="249" textAnchor="middle" fontSize="18" fontWeight="700" fill={landingColors.ink}>Estabelecimento</SvgText>
    <SvgText x="617" y="274" textAnchor="middle" fontSize="12" fill={landingColors.inkMuted}>Serviços e horários reais</SvgText>
    <Line x1="528" y1="303" x2="706" y2="303" stroke={landingColors.borderStrong} />
    <SvgText x="536" y="337" fontSize="11" fill={landingColors.inkMuted}>SERVIÇO</SvgText><SvgText x="698" y="337" textAnchor="end" fontSize="12" fontWeight="700" fill={landingColors.ink}>R$ 45,00</SvgText>
    <Rect x="528" y="366" width="178" height="48" rx="13" fill={landingColors.brand} />
    <SvgText x="617" y="396" textAnchor="middle" fontSize="13" fontWeight="700" fill={landingColors.white}>Continuar</SvgText>
  </G>
);

const OwnerPreview = () => (
  <G>
    <Header label="VISÃO DO DONO" />
    <Rect x="22" y="94" width="176" height="384" rx="22" fill={landingColors.surface} stroke={landingColors.border} />
    <SvgText x="48" y="132" fontSize="11" letterSpacing="1.2" fill={landingColors.inkMuted}>OPERAÇÃO</SvgText>
    {['Visão geral', 'Relatórios', 'Serviços', 'Equipe'].map((label, index) => (
      <G key={label}>
        <Rect x="40" y={151 + index * 58} width="140" height="42" rx="12" fill={index === 0 ? landingColors.brandSoft : landingColors.surfaceSoft} />
        <Circle cx="59" cy={172 + index * 58} r="5" fill={index === 0 ? landingColors.brand : landingColors.borderStrong} />
        <SvgText x="75" y={177 + index * 58} fontSize="12" fontWeight={index === 0 ? '700' : '400'} fill={landingColors.ink}>{label}</SvgText>
      </G>
    ))}
    <Rect x="218" y="94" width="560" height="384" rx="22" fill={landingColors.surface} stroke={landingColors.border} />
    <SvgText x="248" y="132" fontSize="12" letterSpacing="1.2" fill={landingColors.inkMuted}>HOJE NA UNIDADE</SvgText>
    <SvgText x="248" y="166" fontSize="24" fontWeight="700" fill={landingColors.ink}>Operação em foco</SvgText>
    {[
      ['PRODUÇÃO', 'R$ 820'], ['AGENDADO', 'R$ 460'], ['OCUPAÇÃO', '68%'], ['PENDENTES', '2'],
    ].map(([label, value], index) => (
      <G key={label}>
        <Rect x={248 + index * 124} y="190" width="112" height="76" rx="14" fill={index === 2 ? landingColors.brandSoft : landingColors.surfaceSoft} stroke={landingColors.border} />
        <SvgText x={262 + index * 124} y="216" fontSize="9" fill={landingColors.inkMuted}>{label}</SvgText>
        <SvgText x={262 + index * 124} y="247" fontSize="18" fontWeight="700" fill={landingColors.ink}>{value}</SvgText>
      </G>
    ))}
    <SvgText x="248" y="304" fontSize="13" fontWeight="700" fill={landingColors.ink}>Próximos atendimentos</SvgText>
    {[
      ['09:30', 'Cliente 01', 'Confirmado'], ['10:30', 'Cliente 02', 'Pendente'], ['11:30', 'Cliente 03', 'Confirmado'],
    ].map(([time, client, status], index) => (
      <G key={time}>
        <Rect x="248" y={321 + index * 45} width="500" height="36" rx="10" fill={landingColors.surfaceSoft} />
        <SvgText x="263" y={344 + index * 45} fontSize="11" fontWeight="700" fill={landingColors.ink}>{time}</SvgText>
        <SvgText x="326" y={344 + index * 45} fontSize="11" fill={landingColors.ink}>{client}</SvgText>
        <SvgText x="728" y={344 + index * 45} textAnchor="end" fontSize="10" fill={status === 'Pendente' ? landingColors.warning : landingColors.success}>{status}</SvgText>
      </G>
    ))}
  </G>
);

const ProfessionalPreview = () => (
  <G>
    <Header label="VISÃO PROFISSIONAL" />
    <Rect x="22" y="94" width="756" height="384" rx="22" fill={landingColors.surface} stroke={landingColors.border} />
    <SvgText x="52" y="134" fontSize="12" letterSpacing="1.2" fill={landingColors.inkMuted}>MINHA AGENDA</SvgText>
    <SvgText x="52" y="170" fontSize="25" fontWeight="700" fill={landingColors.ink}>Seu dia, sem ruído</SvgText>
    <Rect x="52" y="196" width="456" height="94" rx="18" fill={landingColors.accentSoft} />
    <SvgText x="74" y="225" fontSize="10" fill={landingColors.warning}>PRÓXIMO ATENDIMENTO</SvgText>
    <SvgText x="74" y="258" fontSize="20" fontWeight="700" fill={landingColors.ink}>09:30 · Cliente 01</SvgText>
    <SvgText x="74" y="279" fontSize="11" fill={landingColors.inkMuted}>Corte essencial · 30 min</SvgText>
    <Rect x="532" y="196" width="194" height="94" rx="18" fill={landingColors.brandSoft} />
    <SvgText x="552" y="225" fontSize="10" fill={landingColors.brand}>PRODUÇÃO CONCLUÍDA</SvgText>
    <SvgText x="552" y="259" fontSize="21" fontWeight="700" fill={landingColors.ink}>R$ 410</SvgText>
    <SvgText x="552" y="279" fontSize="10" fill={landingColors.inkMuted}>Comissão projetada: R$ 205</SvgText>
    <SvgText x="52" y="330" fontSize="13" fontWeight="700" fill={landingColors.ink}>Agenda do dia</SvgText>
    {[
      ['09:30', 'Corte essencial', 'Confirmado'], ['10:30', 'Corte e barba', 'Confirmado'], ['13:00', 'Barba', 'Pendente'],
    ].map(([time, service, status], index) => (
      <G key={time}>
        <Rect x="52" y={347 + index * 39} width="674" height="32" rx="9" fill={landingColors.surfaceSoft} />
        <SvgText x="68" y={368 + index * 39} fontSize="11" fontWeight="700" fill={landingColors.ink}>{time}</SvgText>
        <SvgText x="133" y={368 + index * 39} fontSize="11" fill={landingColors.ink}>{service}</SvgText>
        <SvgText x="706" y={368 + index * 39} textAnchor="end" fontSize="10" fill={status === 'Pendente' ? landingColors.warning : landingColors.success}>{status}</SvgText>
      </G>
    ))}
  </G>
);

export const ProductPreview = ({ variant, screenshotSrc, accessibilityLabel, aspectRatio = 16 / 10, style }: ProductPreviewProps) => (
  <TiltCard style={style} testID={`landing-preview-${variant}`}>
    <GlassSurface variant="preview" style={[styles.frame, landingShadows.raised]}>
      <View accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: '100%', aspectRatio }}>
        {screenshotSrc ? (
          <Image source={screenshotSrc} style={styles.image} contentFit="cover" transition={180} />
        ) : (
          <Svg width="100%" height="100%" viewBox="0 0 800 500" role="img">
            <Rect width="800" height="500" fill={landingColors.canvas} />
            {variant === 'client' ? <ClientPreview /> : variant === 'owner' ? <OwnerPreview /> : <ProfessionalPreview />}
          </Svg>
        )}
      </View>
    </GlassSurface>
  </TiltCard>
);

const styles = StyleSheet.create({
  frame: { padding: 10, borderRadius: landingRadii.xl },
  image: { width: '100%', height: '100%', borderRadius: landingRadii.lg },
});
