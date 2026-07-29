import { LiveOperations } from '@/components/live-operations';
import { SectionPage } from '@/components/section-page';

export default function LiveRoute() {
  return (
    <SectionPage
      eyebrow="OPERAÇÃO"
      title="Tempo real"
      description="Acompanhamento operacional por snapshots autoritativos. Eventos privados apenas solicitam a atualização dos dados."
    >
      <LiveOperations />
    </SectionPage>
  );
}
