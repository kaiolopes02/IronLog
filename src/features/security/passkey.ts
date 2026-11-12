const PASSKEY_KEY = 'ironlog.passkey';

export function hasPasskey(): boolean {
  try {
    return Boolean(localStorage.getItem(PASSKEY_KEY));
  } catch {
    return false;
  }
}

export function passkeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'PublicKeyCredential' in window &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

function challenge(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Local-only WebAuthn gate. There is no server to verify an assertion, and the
 * PRF extension (which could derive a key) is absent on iOS 14.5. It is used
 * solely to confirm presence before changing security settings.
 */
export async function registerPasskey(): Promise<boolean> {
  if (!passkeySupported()) return false;
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge(),
        rp: { name: 'IronLog' },
        user: {
          id: challenge(),
          name: 'ironlog-local',
          displayName: 'IronLog',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!credential) return false;
    localStorage.setItem(
      PASSKEY_KEY,
      JSON.stringify(Array.from(new Uint8Array(credential.rawId))),
    );
    return true;
  } catch {
    return false;
  }
}

export async function assertPasskey(): Promise<boolean> {
  if (!passkeySupported()) return false;
  const stored = localStorage.getItem(PASSKEY_KEY);
  if (!stored) return false;
  try {
    const id = new Uint8Array(JSON.parse(stored) as number[]);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        allowCredentials: [{ type: 'public-key', id }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}
