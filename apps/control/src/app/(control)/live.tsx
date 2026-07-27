import { PendingIntegration, SectionPage } from '@/components/section-page';

export default function LiveRoute() {
  return (
    <SectionPage
      eyebrow="OPERAÇÃO"
      title="Tempo real"
      description="Eventos apenas invalidarão snapshots autoritativos; o canal Realtime não será tratado como fonte de verdade."
    >
      <PendingIntegration
        source="Supabase Realtime privado"
        detail="A próxima etapa criará o canal control:live, políticas de autorização e reconciliação automática dos snapshots."
      />
    </SectionPage>
  );
}
