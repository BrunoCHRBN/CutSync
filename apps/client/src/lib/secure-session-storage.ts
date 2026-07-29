import { secureChunkedStorage } from './secure-chunked-storage';

// Mantém o contrato e as chaves de sessão existentes; apenas reutiliza o
// mecanismo genérico de fragmentação para outros dados protegidos.
export const secureSessionStorage = secureChunkedStorage;
