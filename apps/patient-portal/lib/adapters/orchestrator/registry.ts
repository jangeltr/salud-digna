import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "./config";

/**
 * Registro del canal Web: qué trámites inició cada paciente en este portal.
 * El orquestador no ofrece consultar los trámites de un paciente, así que este archivo es
 * la única fuente de esa relación. Guarda identificadores y fechas. Nunca permisos ni claves.
 *
 * Solo sirve con un único proceso del portal: la copia en memoria manda y el archivo la conserva
 * entre reinicios.
 */
export type RegistryEntry = {
  id: string;
  /** Cuándo registró el portal el trámite, en ISO 8601. */
  createdAt: string;
  /** Cuándo supo el portal que el trámite quedó cerrado. Un trámite cerrado no vuelve a abrirse. */
  closedAt?: string;
};

type RegistryData = { version: 1; patients: Record<string, RegistryEntry[]> };

const FILE_NAME = "web-channel-registry.json";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RENAME_ATTEMPTS = 4;

type State = { data?: RegistryData; queue: Promise<unknown> };

// En `globalThis` para que todas las copias del módulo que cargue Next compartan estado y cola de escritura.
const STATE = Symbol.for("salud-digna.patient-portal.web-channel-registry");
type Holder = { [STATE]?: State };

function state(): State {
  const holder = globalThis as Holder;
  holder[STATE] ??= { queue: Promise.resolve() };
  return holder[STATE];
}

function filePath(): string {
  return path.join(getDataDir(), FILE_NAME);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Acepta solo la forma esperada. Un archivo con otra forma se trata como ilegible, sin sobrescribirlo. */
function parse(raw: string): RegistryData {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("forma inesperada");
  const { version, patients } = parsed as { version?: unknown; patients?: unknown };
  if (version !== 1 || !patients || typeof patients !== "object" || Array.isArray(patients)) {
    throw new Error("forma inesperada");
  }

  const data: RegistryData = { version: 1, patients: {} };
  for (const [accountId, entries] of Object.entries(patients)) {
    if (!Array.isArray(entries)) throw new Error("forma inesperada");
    data.patients[accountId] = entries.map((entry: unknown) => {
      const { id, createdAt, closedAt } = (entry ?? {}) as Record<string, unknown>;
      if (typeof id !== "string" || !UUID.test(id) || !isDate(createdAt)) throw new Error("forma inesperada");
      return { id: id.toLowerCase(), createdAt, ...(isDate(closedAt) ? { closedAt } : {}) };
    });
  }
  return data;
}

async function load(): Promise<RegistryData> {
  const current = state();
  if (current.data) return current.data;

  let raw: string;
  try {
    raw = await readFile(filePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Sin archivo todavía: el registro empieza vacío y se crea con la primera escritura.
    current.data = { version: 1, patients: {} };
    return current.data;
  }
  current.data = parse(raw);
  return current.data;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Escritura atómica: el contenido completo va a un archivo temporal de la misma carpeta y después
 * sustituye al registro con un renombrado. Un corte a mitad deja el archivo anterior intacto.
 * Carpeta y archivo se crean solo para el usuario del proceso. En Windows los permisos los fija la carpeta.
 */
async function save(data: RegistryData): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });

  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(temporary, target);
        return;
      } catch (error) {
        // En Windows el renombrado falla si otro proceso tiene abierto el archivo un instante.
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= RENAME_ATTEMPTS || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
        await delay(40 * attempt);
      }
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Ejecuta las operaciones de una en una, para que dos escrituras simultáneas no se pisen. */
function enqueue<Value>(task: () => Promise<Value>): Promise<Value> {
  const current = state();
  const result = current.queue.then(task, task);
  current.queue = result.catch(() => undefined);
  return result;
}

/** Aplica un cambio y lo guarda. La copia en memoria solo cambia si el archivo quedó escrito. */
function update(change: (entries: RegistryEntry[]) => RegistryEntry[] | undefined, accountId: string): Promise<void> {
  return enqueue(async () => {
    const data = await load();
    const next = change(data.patients[accountId] ?? []);
    if (!next) return;

    const updated: RegistryData = { version: 1, patients: { ...data.patients, [accountId]: next } };
    await save(updated);
    state().data = updated;
  });
}

/** Trámites del paciente, del más reciente al más antiguo. */
export function listRegistered(accountId: string): Promise<RegistryEntry[]> {
  return enqueue(async () => [...((await load()).patients[accountId] ?? [])].reverse());
}

/** Indica si el trámite pertenece al paciente. Es la comprobación previa a cualquier llamada al orquestador. */
export function isRegistered(accountId: string, requestId: string): Promise<boolean> {
  const id = requestId.toLowerCase();
  return enqueue(async () => ((await load()).patients[accountId] ?? []).some((entry) => entry.id === id));
}

export function register(accountId: string, requestId: string, createdAt: string): Promise<void> {
  const id = requestId.toLowerCase();
  return update(
    (entries) => (entries.some((entry) => entry.id === id) ? undefined : [...entries, { id, createdAt }]),
    accountId,
  );
}

/** Anota que el trámite quedó cerrado, para que deje de aparecer entre los pendientes. */
export function markClosed(accountId: string, requestId: string, closedAt: string): Promise<void> {
  const id = requestId.toLowerCase();
  return update((entries) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry || entry.closedAt) return undefined;
    return entries.map((item) => (item.id === id ? { ...item, closedAt } : item));
  }, accountId);
}

/** Se ejecuta al arrancar: crea la carpeta y comprueba que el registro se puede leer. */
export async function prepareRegistry(): Promise<void> {
  await mkdir(getDataDir(), { recursive: true, mode: 0o700 });
  await enqueue(load);
}

// El registro de errores nombra la operación y nunca incluye identificadores ni rutas con datos del paciente.
export function reportRegistryFailure(operation: "leer" | "escribir"): void {
  console.error(`[registro] no se pudo ${operation} el registro del canal Web`);
}
