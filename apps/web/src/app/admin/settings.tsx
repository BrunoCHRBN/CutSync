import React from 'react';
import { Redirect } from 'expo-router';

export default function SettingsShortcutRoute() {
  return <Redirect href="/(admin)/settings" />;
}