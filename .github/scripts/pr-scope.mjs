import { appendFileSync, readFileSync } from 'node:fs';

const integrationApps = new Set(['api', 'patient-portal', 'call-center', 'admin', 'operations']);

function shared(path) {
  return path.startsWith('packages/') || path.startsWith('.github/')
    || (!path.includes('/') && !path.endsWith('.md'));
}

function area(path) {
  if (path.startsWith('apps/api/') || path === 'docs/openapi.json') return 'Backend y contrato';
  if (path.startsWith('apps/operations/')) return 'Área reservada';
  if (path === 'AGENTS.md' || path === 'CLAUDE.md' || path.startsWith('.github/')) {
    return 'Reglas y automatización';
  }
  if (shared(path)) return 'Workspace compartido';
  return undefined;
}

function readChangedPaths() {
  const diff = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(0));
  if (diff === '') return [];

  const paths = diff.split('\0');
  if (paths.pop() !== '' || paths.some((path) =>
    path.split('/').some((part) => part === '' || part === '.' || part === '..'))) {
    throw new Error('El diff contiene rutas inválidas o un registro sin terminador NUL.');
  }
  return paths;
}

const paths = readChangedPaths();
const apps = new Set();
for (const path of paths) {
  const [, app] = path.split('/');
  if (path.startsWith('apps/') && integrationApps.has(app)) apps.add(app);
}

const protectedPaths = paths.filter((path) => area(path));
const openapi = apps.has('api') || paths.includes('docs/openapi.json');
if (openapi) apps.add('api');
const full = paths.some((path) => shared(path) || path.endsWith('/package.json')
  || (path.startsWith('apps/') && !integrationApps.has(path.split('/')[1])));
const build = full || apps.size > 0;
appendFileSync(process.env.GITHUB_OUTPUT, [
  `build=${build}`, `full=${full}`, `apps=${[...apps].join(' ')}`, `openapi=${openapi}`, '',
].join('\n'));

const report = [
  '## Alcance de integración',
  '',
  full ? 'Compilación del workspace completo.'
    : build ? `Paquetes a comprobar si tienen manifiesto: ${[...apps].join(', ')}.`
      : 'El diff no requiere compilar paquetes.',
  '',
  protectedPaths.length
    ? 'Riesgo elevado. Se requiere revisión del propietario según la política del repositorio.'
    : 'Sin cambios en áreas reservadas. Aplicar revisión habitual.',
  '',
  ...protectedPaths.map((path) => {
    const escaped = JSON.stringify(path).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/`/g, '&#96;');
    return `- ${area(path)} | <code>${escaped}</code>`;
  }),
  '',
  'Este resumen es informativo. Las aprobaciones se verifican mediante la protección de GitHub o por el propietario.',
  '',
].join('\n');
appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
