import 'reflect-metadata';
import { loadLocalEnv, readDatabaseUrl } from '../config/database';
import { PrismaService } from '../persistence/prisma.service';
import { DemoGrantError, issueDemoJourneyGrant, parseDemoGrantOptions } from './demo-journey-grant';

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseDemoGrantOptions(process.argv.slice(2), process.env.ORCHESTRATOR_DEMO_GRANT_MAX_SECONDS);
  if (readDatabaseUrl()?.hostname !== '127.0.0.1') {
    throw new DemoGrantError('La emisión de demostración requiere la base local del orquestador.');
  }

  const prisma = new PrismaService();
  try {
    const token = await issueDemoJourneyGrant(prisma.client, options);
    process.stdout.write(`${token}\n`);
  } finally {
    await prisma.onApplicationShutdown();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof DemoGrantError ? error.message : 'No se pudo emitir el permiso de demostración.');
  process.exitCode = 1;
});
