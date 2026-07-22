import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { landingColors, landingRadii, landingTypography } from '../../theme/landing-tokens';

interface EditorialBandProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const EditorialBand = ({ eyebrow, title, description, children, style, testID }: EditorialBandProps) => (
  <View testID={testID} style={[styles.editorialBand, style]}>
    <View style={styles.editorialCopy}>
      <Text style={styles.editorialEyebrow}>{eyebrow}</Text>
      <Text style={styles.editorialTitle}>{title}</Text>
      <Text style={styles.editorialDescription}>{description}</Text>
    </View>
    {children}
  </View>
);

interface ProductStoryProps {
  index: string;
  title: string;
  description: string;
  active?: boolean;
}

export const ProductStory = ({ index, title, description, active = false }: ProductStoryProps) => (
  <View style={[styles.productStory, active && styles.productStoryActive]}>
    <Text style={[styles.productStoryIndex, active && styles.productStoryIndexActive]}>{index}</Text>
    <View style={styles.productStoryCopy}>
      <Text style={[styles.productStoryTitle, active && styles.productStoryTitleActive]}>{title}</Text>
      <Text style={styles.productStoryDescription}>{description}</Text>
    </View>
  </View>
);

interface EstablishmentMediaProps {
  name: string;
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
}

const getInitials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

export const EstablishmentMedia = ({ name, uri, style }: EstablishmentMediaProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [uri]);

  return (
    <View style={[styles.media, style]}>
      {uri && !failed ? (
        <Image
          accessibilityLabel={`Imagem de ${name}`}
          source={{ uri }}
          style={styles.mediaImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={180}
          onError={() => setFailed(true)}
        />
      ) : (
        <View accessibilityRole="image" accessibilityLabel={`Identidade visual de ${name}`} style={styles.mediaFallback}>
          <View style={styles.fallbackOrb} />
          <Text style={styles.mediaInitials}>{getInitials(name)}</Text>
          <Text numberOfLines={1} style={styles.mediaCaption}>{name}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  editorialBand: {
    overflow: 'hidden',
    paddingVertical: 64,
    paddingHorizontal: 48,
    gap: 40,
    borderRadius: landingRadii.xl,
    backgroundColor: landingColors.brandStrong,
  },
  editorialCopy: { maxWidth: 720, gap: 11 },
  editorialEyebrow: { color: landingColors.onBrandMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  editorialTitle: { color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 42, lineHeight: 48, letterSpacing: -1.8 },
  editorialDescription: { maxWidth: 650, color: landingColors.onBrand, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 24 },
  productStory: {
    flex: 1,
    minHeight: 88,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderLeftWidth: 2,
    borderLeftColor: landingColors.border,
  },
  productStoryActive: { borderLeftColor: landingColors.brand, backgroundColor: landingColors.brandSoft },
  productStoryIndex: { color: landingColors.inkMuted, fontFamily: landingTypography.mono, fontSize: 11, paddingTop: 3 },
  productStoryIndexActive: { color: landingColors.brand },
  productStoryCopy: { flex: 1, gap: 5 },
  productStoryTitle: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  productStoryTitleActive: { color: landingColors.ink },
  productStoryDescription: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 19 },
  media: { overflow: 'hidden', backgroundColor: landingColors.brandSoft },
  mediaImage: { width: '100%', height: '100%' },
  mediaFallback: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: landingColors.brandSoft },
  fallbackOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(197,166,109,0.22)' },
  mediaInitials: { color: landingColors.brand, fontFamily: landingTypography.displayBold, fontSize: 40 },
  mediaCaption: { maxWidth: '80%', color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 11 },
});
