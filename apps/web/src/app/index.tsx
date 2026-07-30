import Head from 'expo-router/head';
import { ClientLanding } from '../components/landing/client-landing';

const siteUrl = (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const canonicalUrl = siteUrl ? `${siteUrl}/` : '/';
const description = 'Encontre estabelecimentos, consulte serviços, preços informados pelo estabelecimento e horários publicados, e agende pelo CutSync sem depender de mensagens.';

export default function ClientLandingRoute() {
  return (
    <>
      <Head>
        <title>CutSync — Encontre serviços e agende seu horário</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content="index, follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CutSync" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:title" content="CutSync — Encontre serviços e agende seu horário" />
        <meta property="og:description" content="Explore serviços e consulte a agenda de cada estabelecimento antes de confirmar." />
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CutSync — Encontre serviços e agende seu horário" />
        <meta name="twitter:description" content="Explore serviços e consulte a agenda de cada estabelecimento antes de confirmar." />
      </Head>
      <ClientLanding />
    </>
  );
}
