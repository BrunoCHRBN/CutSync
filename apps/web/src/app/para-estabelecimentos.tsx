import Head from 'expo-router/head';
import { BusinessLandingV2 } from '../components/landing/v2/business-landing-v2';

const siteUrl = (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const canonicalUrl = siteUrl ? `${siteUrl}/para-estabelecimentos` : '/para-estabelecimentos';
const description = 'Conecte a vitrine pública do seu estabelecimento à agenda usada pela equipe: serviços, horários, equipe e a rotina do profissional em um só fluxo. Fale com a equipe do CutSync.';

export default function BusinessLandingRoute() {
  return (
    <>
      <Head>
        <title>CutSync para estabelecimentos — Vitrine e agenda conectadas</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content="index, follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CutSync" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:title" content="CutSync para estabelecimentos — Vitrine e agenda conectadas" />
        <meta property="og:description" content="Conecte a apresentação do seu negócio à agenda usada pela equipe." />
        <meta property="og:url" content={canonicalUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CutSync para estabelecimentos — Vitrine e agenda conectadas" />
        <meta name="twitter:description" content="Conecte a apresentação do seu negócio à agenda usada pela equipe." />
      </Head>
      <BusinessLandingV2 />
    </>
  );
}
