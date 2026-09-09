import * as Crypto from 'expo-crypto';

// Unambiguous alphabet (no 0/O/1/I/L/U) — this code is typed/read by
// customers off a shared link and doubles as the access credential for a
// Social Checkout draft (see social_checkout_public_rpcs.sql), so it needs
// real entropy, not a short timestamp suffix like generateOrderNumber().
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;

export async function generateCheckoutCode(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}
