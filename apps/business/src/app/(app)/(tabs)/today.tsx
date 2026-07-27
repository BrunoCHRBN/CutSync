import {
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';

export default function TodayRoute() {
  const { activeContext } = useBusinessOperational();

  return (
    <BusinessPage testID="business-today-shell">
      <BusinessHeader
        eyebrow="HOJE"
        title="Resumo operacional"
        description={activeContext?.establishmentName}
      />
      <BusinessNotice message="A navegação operacional está pronta para receber a leitura diária da agenda." />
    </BusinessPage>
  );
}
