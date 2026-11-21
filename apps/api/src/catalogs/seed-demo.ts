import { loadLocalEnv } from '../config/load-local-env';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';

const clinics = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Demo Clínica Alameda', address: 'Avenida Ejemplo 101' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Demo Clínica Mirador', address: 'Calle Ejemplo 202' },
  { id: '00000000-0000-4000-8000-000000000103', name: 'Demo Clínica Río', address: 'Paseo Ejemplo 303' },
].map((clinic) => ({ ...clinic, city: 'Ciudad Ejemplo', state: 'Estado Ejemplo' }));

const studies = [
  { id: '00000000-0000-4000-8000-000000000201', name: 'Demo Glucosa', price: '120.00' },
  { id: '00000000-0000-4000-8000-000000000202', name: 'Demo Biometría hemática', price: '185.00' },
  { id: '00000000-0000-4000-8000-000000000203', name: 'Demo Perfil de lípidos', price: '310.50' },
  { id: '00000000-0000-4000-8000-000000000204', name: 'Demo Examen general de orina', price: '140.00' },
  { id: '00000000-0000-4000-8000-000000000205', name: 'Demo Radiografía simple', price: '420.00' },
].map(({ price, ...study }) => ({
  ...study,
  description: 'Estudio sintético. Precio de demostración, sin validez como tarifa oficial.',
  price: new Prisma.Decimal(price),
}));

export async function seedDemoCatalogs(client: PrismaClient) {
  const [addedClinics, addedStudies] = await client.$transaction([
    client.clinic.createMany({ data: clinics, skipDuplicates: true }),
    client.study.createMany({ data: studies, skipDuplicates: true }),
  ]);

  return { clinics: addedClinics.count, studies: addedStudies.count };
}

async function run(): Promise<void> {
  loadLocalEnv();
  const prisma = new PrismaService();
  try {
    const inserted = await seedDemoCatalogs(prisma.client);
    console.log(`Datos sintéticos insertados. Clínicas: ${inserted.clinics}. Estudios: ${inserted.studies}.`);
  } finally {
    await prisma.onApplicationShutdown();
  }
}

if (require.main === module) {
  void run().catch(() => {
    console.error('No se pudo cargar el catálogo sintético. Revisa la conexión y las migraciones.');
    process.exitCode = 1;
  });
}
