import React from 'react';
import { Redirect } from 'expo-router';

/** Compatibility surface kept for old links and bookmarks. */
export default function SuperadminCompatibilityRoute() {
  return <Redirect href="/governance/requests" />;
}
