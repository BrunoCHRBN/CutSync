import Head from 'expo-router/head';
import { EstablishmentBookingExperience } from '../../components/establishment/EstablishmentBookingExperience';

export default function PublicBookingRoute() {
  return (
    <>
      <Head><meta name="robots" content="noindex,nofollow" /></Head>
      <EstablishmentBookingExperience />
    </>
  );
}
