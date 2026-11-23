import type { LoginInput, RegisterInput } from "@/lib/api/auth";

// Límites de RegisterDto y LoginDto en docs/openapi.json.
export const LIMITS = {
  name: 100,
  email: 254,
  passwordMin: 12,
  passwordMax: 128,
  phone: 32,
} as const;

export type AuthField = "firstName" | "lastName" | "email" | "password" | "phone";
export type FieldErrors = Partial<Record<AuthField, string>>;
export type Validated<Input> = { input: Input } | { fieldErrors: FieldErrors };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// La contraseña conserva los espacios que escriba el paciente.
function password(formData: FormData): string {
  const value = formData.get("password");
  return typeof value === "string" ? value : "";
}

function emailError(email: string): string | undefined {
  if (!email) return "Escribe tu correo.";
  if (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Escribe un correo válido.";
  }
  return undefined;
}

function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function validateSignIn(formData: FormData): Validated<LoginInput> {
  const input = { email: text(formData, "email"), password: password(formData) };
  const fieldErrors: FieldErrors = { email: emailError(input.email) };

  if (!input.password) fieldErrors.password = "Escribe tu contraseña.";
  else if (input.password.length > LIMITS.passwordMax) fieldErrors.password = "La contraseña es demasiado larga.";

  return hasErrors(fieldErrors) ? { fieldErrors } : { input };
}

export function validateSignUp(formData: FormData): Validated<RegisterInput> {
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email");
  const phone = text(formData, "phone");
  const secret = password(formData);
  const fieldErrors: FieldErrors = { email: emailError(email) };

  if (!firstName) fieldErrors.firstName = "Escribe tu nombre.";
  else if (firstName.length > LIMITS.name) fieldErrors.firstName = `Usa ${LIMITS.name} caracteres como máximo.`;

  if (!lastName) fieldErrors.lastName = "Escribe tus apellidos.";
  else if (lastName.length > LIMITS.name) fieldErrors.lastName = `Usa ${LIMITS.name} caracteres como máximo.`;

  if (secret.length < LIMITS.passwordMin || secret.length > LIMITS.passwordMax) {
    fieldErrors.password = `La contraseña debe tener entre ${LIMITS.passwordMin} y ${LIMITS.passwordMax} caracteres.`;
  }

  if (phone.length > LIMITS.phone) fieldErrors.phone = `Usa ${LIMITS.phone} caracteres como máximo.`;

  if (hasErrors(fieldErrors)) return { fieldErrors };

  // El contrato pide omitir el teléfono cuando no se conoce.
  return { input: { firstName, lastName, email, password: secret, ...(phone ? { phone } : {}) } };
}
