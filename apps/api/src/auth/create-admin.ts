import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { isEmail, length } from 'class-validator';
import { loadLocalEnv } from '../config/load-local-env';
import { Prisma } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import {
  hashPassword,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
} from './credentials';

async function createAdmin(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) {
    throw new Error('Ejecuta el comando en una terminal interactiva y sin argumentos.');
  }

  loadLocalEnv();
  let mute = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!mute) process.stdout.write(chunk);
      callback();
    },
  });
  const input = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  const cancellation = new AbortController();
  input.once('SIGINT', () => cancellation.abort());
  input.once('close', () => cancellation.abort());

  const ask = (prompt: string) => input.question(prompt, { signal: cancellation.signal });
  async function askSecret(prompt: string): Promise<string> {
    process.stdout.write(prompt);
    mute = true;
    try {
      return await ask('');
    } finally {
      mute = false;
      process.stdout.write('\n');
    }
  }

  let email: string;
  let password: string;
  try {
    email = normalizeEmail(await ask('Correo del administrador: '));
    if (email.length > MAX_EMAIL_LENGTH || !isEmail(email)) {
      console.error('Introduce un correo válido.');
      process.exitCode = 1;
      return;
    }

    password = await askSecret('Contraseña: ');
    if (!length(password, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH)) {
      console.error(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`);
      process.exitCode = 1;
      return;
    }

    if (password !== await askSecret('Confirma la contraseña: ')) {
      console.error('Las contraseñas no coinciden.');
      process.exitCode = 1;
      return;
    }
  } finally {
    input.close();
  }

  const prisma = new PrismaService();
  try {
    const passwordHash = await hashPassword(password);
    await prisma.client.user.create({
      data: { email, passwordHash, role: UserRole.ADMIN },
      select: { id: true },
    });
    console.log('Cuenta ADMIN creada.');
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      console.error('El correo ya está registrado.');
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await prisma.onApplicationShutdown();
  }
}

void createAdmin().catch((error: unknown) => {
  if (error instanceof Error && error.name === 'AbortError') {
    console.error('Creación de cuenta cancelada.');
  } else if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) {
    console.error('Ejecuta el comando en una terminal interactiva y sin argumentos.');
  } else {
    console.error('No se pudo crear la cuenta. Revisa la configuración local de PostgreSQL.');
  }

  process.exitCode = 1;
});
