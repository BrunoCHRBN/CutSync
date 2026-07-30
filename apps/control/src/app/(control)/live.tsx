import { LiveOperations } from '@/components/live-operations';
import { RequireControlPermission } from '@/components/require-control-permission';
import { SectionPage } from '@/components/section-page';

export default function LiveRoute() {
  return (
    <RequireControlPermission permission="control.live.read">
      <SectionPage
        eyebrow="OPERAÇÃO"
        title="Tempo real"
        description="Acompanhamento operacional por snapshots autoritativos. Eventos privados apenas solicitam a atualização dos dados."
      >
        <LiveOperations />
      </SectionPage>
    </RequireControlPermission>
  );
}
