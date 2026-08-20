import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacySalonRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={`/${slug}` as never} />;
}
