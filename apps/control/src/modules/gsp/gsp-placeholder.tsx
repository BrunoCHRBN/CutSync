import React from 'react';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { PendingIntegration, SectionPage } from '@/components/section-page';

export function GspPlaceholder({
  eyebrow,
  title,
  description,
  source,
  detail,
}: {
  eyebrow: string;
  title: string;
  description: string;
  source: string;
  detail: string;
}) {
  return (
    <SectionPage eyebrow={eyebrow} title={title} description={description}>
      <PendingIntegration source={source} detail={detail} />
      <FeedbackState
        kind="partial"
        title="Superfície preparada"
        message="Nenhum dado simulado é exibido. A proteção da rota permanece ativa independentemente da visibilidade do menu."
      />
    </SectionPage>
  );
}
