import "server-only";
import { apiRequest } from "./client";
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Account = Schemas["AccountDto"];
export type LoginInput = Schemas["LoginDto"];
export type LoginResponse = Schemas["LoginResponseDto"];
export type RegisterInput = Schemas["RegisterDto"];

export function register(input: RegisterInput) {
  return apiRequest<Account>({ method: "POST", path: "/auth/register", body: input });
}

export function login(input: LoginInput) {
  return apiRequest<LoginResponse>({ method: "POST", path: "/auth/login", body: input });
}

export function getMe(token: string) {
  return apiRequest<Account>({ method: "GET", path: "/auth/me", token });
}
