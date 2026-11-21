export const JWT_CONFIG = Symbol('JWT_CONFIG');

export function loadJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || /\s/.test(secret)) {
    throw new Error('Configura JWT_SECRET con un secreto aleatorio de al menos 32 bytes y sin espacios.');
  }

  const raw = process.env.JWT_EXPIRES_IN ?? '1800';
  const expiresIn = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(expiresIn) || expiresIn < 1) {
    throw new Error('JWT_EXPIRES_IN debe indicar un número entero positivo de segundos.');
  }

  return { secret, expiresIn };
}

export type JwtConfig = ReturnType<typeof loadJwtConfig>;
