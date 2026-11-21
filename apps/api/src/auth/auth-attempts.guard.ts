import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 10_000;

@Injectable()
export class AuthAttemptsGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();
  private sweepAt = 0;

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const ip = http.getRequest<{ ip?: string }>().ip ?? 'unknown';
    const now = Date.now();

    if (now >= this.sweepAt) {
      for (const [key, entry] of this.attempts) {
        if (entry.expiresAt <= now) this.attempts.delete(key);
      }
      this.sweepAt = now + 60_000;
    }

    const entry = this.attempts.get(ip);
    if (entry && entry.expiresAt > now) {
      if (entry.count >= MAX_ATTEMPTS) {
        this.reject(http, Math.ceil((entry.expiresAt - now) / 1000));
      }

      entry.count++;
      return true;
    }

    if (!entry && this.attempts.size >= MAX_TRACKED_IPS) {
      this.reject(http, Math.ceil((this.sweepAt - now) / 1000));
    }

    this.attempts.set(ip, { count: 1, expiresAt: now + WINDOW_MS });
    return true;
  }

  private reject(http: ReturnType<ExecutionContext['switchToHttp']>, seconds: number): never {
    http.getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader('Retry-After', String(seconds));
    throw new HttpException('Demasiados intentos. Intenta más tarde.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
