import {
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';

export default function AgendaRoute() {
  const { activeContext } = useBusinessOperational();

  return (
    <BusinessPage testID="business-agenda-shell">
      <BusinessHeader
        eyebrow="AGENDA"
        title="Agenda operacional"
        description={activeContext?.establishmentName}
      />
      <BusinessNotice message="A base própria e de equipe será conectada à leitura diária na próxima fatia." />
    </BusinessPage>
  );
}
