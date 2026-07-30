import { PendingIntegration, SectionPage } from '@/components/section-page';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function GovernanceRoute() {
  return (
    <RequireControlPermission permission="control.governance.read">
      <SectionPage
        eyebrow="GOVERNANÇA"
        title="Operações de governança"
        description="A central existente será transferida após paridade funcional e validação da matriz Viewer, Editor e Owner."
      >
        <PendingIntegration
          source="Central de governança existente"
          detail="As rotas atuais permanecem no Web enquanto a migração para o Control é validada sem perda de funcionalidades."
        />
      </SectionPage>
    </RequireControlPermission>
  );
}
