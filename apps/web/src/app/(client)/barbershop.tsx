import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Deprecated alias of `/(client)/establishment`.
 * Kept so existing deep links with `barbershopId` keep working during the rename window.
 */
export default function LegacyClientBarbershopRedirect() {
  const params = useLocalSearchParams<{
    establishmentId?: string | string[];
    barbershopId?: string | string[];
  }>();

  const establishmentId = Array.isArray(params.establishmentId)
    ? params.establishmentId[0]
    : params.establishmentId
      || (Array.isArray(params.barbershopId) ? params.barbershopId[0] : params.barbershopId);

  if (!establishmentId) {
    return <Redirect href="/(client)" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/(client)/establishment',
        params: { establishmentId },
      }}
    />
  );
}
