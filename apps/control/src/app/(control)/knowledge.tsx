import { PendingIntegration, SectionPage } from '@/components/section-page';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function KnowledgeRoute() {
  return (
    <RequireControlPermission permission="control.knowledge.read">
      <SectionPage
        eyebrow="CONHECIMENTO"
        title="Base operacional"
        description="Conteúdo oficial, rascunhos e moderação serão migrados junto com a central de governança."
      >
        <PendingIntegration
          source="Base de conhecimento da governança"
          detail="A migração preservará publicação, moderação, autoria e auditoria já existentes."
        />
      </SectionPage>
    </RequireControlPermission>
  );
}
