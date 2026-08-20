import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacySalonBookingRoute() {
  const params = useLocalSearchParams<{ slug: string; professional_id?: string; service_id?: string }>();
  return <Redirect href={{ pathname: `/${params.slug}/booking`, params } as never} />;
}
