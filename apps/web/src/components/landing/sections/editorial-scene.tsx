import React from 'react';
import { Image } from 'expo-image';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';

const SOURCES = {
  client: require('../../../../assets/images/landing/landing-client-scene.webp'),
  business: require('../../../../assets/images/landing/landing-business-scene.webp'),
};

interface EditorialSceneProps {
  source: 'client' | 'business';
  caption: string;
  alternativeText: string;
  style?: StyleProp<ViewStyle>;
}

export const EditorialScene = ({ source, caption, alternativeText, style }: EditorialSceneProps) => (
  <View testID={`landing-scene-${source}`} style={[styles.frame, style]}>
    <Image
      accessible
      accessibilityLabel={alternativeText}
      alt={alternativeText}
      source={SOURCES[source]}
      style={styles.image}
      contentFit="cover"
      contentPosition="center"
      cachePolicy="memory-disk"
      transition={220}
      priority="high"
    />
    <View style={styles.captionShell}>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: landingRadii.xl,
    backgroundColor: landingColors.brandSoft,
    borderWidth: 1,
    borderColor: landingColors.border,
  },
  image: { width: '100%', aspectRatio: 16 / 9 },
  captionShell: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: landingRadii.pill,
    backgroundColor: 'rgba(20,33,25,0.72)',
  },
  caption: { color: landingColors.white, fontFamily: landingTypography.bodyMedium, fontSize: 11, letterSpacing: 0.6 },
});
