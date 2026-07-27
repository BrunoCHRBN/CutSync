import { PendingIntegration, SectionPage } from '@/components/section-page';

export default function SupportRoute() {
  return (
    <SectionPage
      eyebrow="ATENDIMENTO"
      title="Fila de suporte"
      description="O Jira Service Management será a fonte autoritativa dos chamados e o Control manterá somente uma projeção operacional."
    >
      <PendingIntegration
        source="Jira Service Management"
        detail="A sincronização server-side, idempotente e sem segredos no bundle será implementada no próximo incremento."
      />
    </SectionPage>
  );
}
