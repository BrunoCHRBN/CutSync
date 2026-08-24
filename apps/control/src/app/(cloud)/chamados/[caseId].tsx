import React from 'react';

import {
  CORPORATE_CASE_STATIC_SHELL_ID,
  CorporateCaseDetailScreen,
} from '@/modules/cases/corporate-case-detail-screen';

/** Static export shell; the client resolves the opaque UUID from the deep-link URL. */
export async function generateStaticParams(): Promise<{ caseId: string }[]> {
  return [{ caseId: CORPORATE_CASE_STATIC_SHELL_ID }];
}

export default function CorporateCaseDetailRoute() {
  return <CorporateCaseDetailScreen />;
}
