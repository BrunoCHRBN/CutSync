import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionHeading } from './SectionHeading';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  testID: string;
}

export const PageHeader = ({ eyebrow, title, description, actions, testID }: PageHeaderProps) => (
  <View testID={testID} style={styles.container}>
    <SectionHeading
      testID={`${testID}-heading`}
      eyebrow={eyebrow}
      title={title}
      description={description}
      action={actions}
      variant="page"
    />
  </View>
);

const styles = StyleSheet.create({
  container: { width: '100%' },
});
