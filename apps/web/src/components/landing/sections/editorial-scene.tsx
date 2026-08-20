import React from 'react';
import { Image } from 'expo-image';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { landingColors, landingTypography } from '../../../theme/landing-tokens';

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
    borderRadius: 0,
    backgroundColor: landingColors.brandSoft,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: landingColors.border,
    marginHorizontal: -24,
  },
  image: { width: '100%', aspectRatio: 21 / 9, minHeight: 280 },
  captionShell: {
    position: 'absolute',
    left: 24,
    bottom: 18,
    paddingVertical: 4,
  },
  caption: {
    color: landingColors.white,
    fontFamily: landingTypography.bodyMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(20,33,25,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});
