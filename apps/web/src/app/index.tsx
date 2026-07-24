import Head from 'expo-router/head';
import { ClientLanding } from '../components/landing/client-landing';

const siteUrl = (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const canonicalUrl = siteUrl ? `${siteUrl}/` : '/';

export default function ClientLandingRoute() {
  return (
    <>
      <Head>
        <title>CutSync — Encontre serviços e agende seu horário</title>
        <meta name="description" content="Explore estabelecimentos, consulte serviços, preços e agendas publicadas e escolha quando agendar pelo CutSync." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="CutSync — Encontre serviços e agende seu horário" />
        <meta property="og:description" content="Explore serviços e consulte a agenda de cada estabelecimento antes de confirmar." />
        <meta property="og:url" content={canonicalUrl} />
      </Head>
      <ClientLanding />
    </>
  );
}
