import { secureSessionStorage } from '@/lib/secure-storage';

import { getActiveEstablishmentStorageKey } from '@/features/access/business-access';

export { getActiveEstablishmentStorageKey } from '@/features/access/business-access';

export const activeEstablishmentStorage = {
  get: (userId: string) => secureSessionStorage.getItem(getActiveEstablishmentStorageKey(userId)),
  set: (userId: string, establishmentId: string) =>
    secureSessionStorage.setItem(
      getActiveEstablishmentStorageKey(userId),
      establishmentId,
    ),
  remove: (userId: string) =>
    secureSessionStorage.removeItem(getActiveEstablishmentStorageKey(userId)),
};
