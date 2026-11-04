// Passphrase-protected backups (gap B18): AES-GCM with a key derived by PBKDF2-SHA-256 (WebCrypto).
// WebCrypto needs a secure context (localhost or HTTPS); callers hide the option elsewhere. Pure.
export const ENCRYPTED_FORMAT = 'boardroom-encrypted';
export const PBKDF2_ITERATIONS = 250_000;
export type EncryptedBackup = {
  format: typeof ENCRYPTED_FORMAT;
  version: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
};

const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Encrypted backups need a secure connection (localhost or HTTPS).');
  return s;
};
async function keyFor(passphrase: string, salt: Uint8Array, iterations: number, usage: KeyUsage) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export const canEncrypt = () => !!globalThis.crypto?.subtle && (globalThis.isSecureContext ?? true);
export const isEncryptedBackup = (v: unknown): v is EncryptedBackup =>
  !!v && typeof v === 'object' && (v as { format?: unknown }).format === ENCRYPTED_FORMAT;

export async function encryptBackup(text: string, passphrase: string): Promise<EncryptedBackup> {
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(passphrase, salt, PBKDF2_ITERATIONS, 'encrypt');
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(data),
  };
}

export async function decryptBackup(backup: EncryptedBackup, passphrase: string): Promise<string> {
  if (
    backup.version !== 1 ||
    !Number.isInteger(backup.iterations) ||
    backup.iterations < 10_000 ||
    backup.iterations > 5_000_000 ||
    typeof backup.salt !== 'string' ||
    typeof backup.iv !== 'string' ||
    typeof backup.data !== 'string'
  )
    throw new Error('This encrypted backup is damaged or from a newer version.');
  const key = await keyFor(passphrase, unb64(backup.salt), backup.iterations, 'decrypt');
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(backup.iv) }, key, unb64(backup.data));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Wrong passphrase, or the file was changed.');
  }
}
