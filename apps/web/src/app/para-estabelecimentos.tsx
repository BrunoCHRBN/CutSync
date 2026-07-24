import Head from 'expo-router/head';
import { BusinessLanding } from '../components/landing/business-landing';

const siteUrl = (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const canonicalUrl = siteUrl ? `${siteUrl}/para-estabelecimentos` : '/para-estabelecimentos';

export default function BusinessLandingRoute() {
  return (
    <>
      <Head>
        <title>CutSync para estabelecimentos — Vitrine e agenda conectadas</title>
        <meta name="description" content="Publique serviços, receba agendamentos e organize a rotina da equipe em um só fluxo com o CutSync." />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="CutSync para estabelecimentos — Vitrine e agenda conectadas" />
        <meta property="og:description" content="Conecte a apresentação do seu negócio à agenda usada pela equipe." />
        <meta property="og:url" content={canonicalUrl} />
      </Head>
      <BusinessLanding />
    </>
  );
}
