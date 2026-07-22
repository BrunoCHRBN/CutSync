import React from 'react';
import { Redirect } from 'expo-router';

export default function AppointmentsShortcutRoute() {
  return <Redirect href={'/(client)/appointments' as never} />;
}