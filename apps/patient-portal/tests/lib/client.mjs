// Navegador de prueba sin JavaScript ni dependencias: guarda cookies, lee formularios y los envía tal como están
// en la página. Solo habla con el portal bajo prueba y con los simuladores, todos en 127.0.0.1.
import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { BASE, HOST, PORTS } from "./config.mjs";

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function unescapeHtml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[entity.toLowerCase()] ?? whole;
  });
}

/** Texto visible de un fragmento de HTML, con los espacios normalizados. */
export function clean(fragment) {
  return unescapeHtml(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const all = (pattern, text) => [...text.matchAll(pattern)];

export class Response {
  constructor(status, headers, body, setCookies, path) {
    Object.assign(this, { status, headers, body, setCookies, path });
  }

  /** Cabecera por nombre, sin distinguir mayúsculas. `null` si no viene. */
  header(name) {
    const value = this.headers[name.toLowerCase()];
    if (value === undefined) return null;
    return Array.isArray(value) ? value.join(", ") : String(value);
  }

  get location() {
    return this.header("location");
  }

  /** Todas las cabeceras como texto, para buscar secretos en ellas. */
  headerText() {
    return Object.entries(this.headers).map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`).join("\n");
  }

  main() {
    const found = /<main[^>]*>([\s\S]*?)<\/main>/.exec(this.body);
    return found ? found[1] : this.body;
  }

  text() {
    return clean(this.main());
  }

  h1() {
    const found = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(this.body);
    return found ? clean(found[1]) : null;
  }

  h2s() {
    return all(/<h2[^>]*>([\s\S]*?)<\/h2>/g, this.main()).map((m) => clean(m[1]));
  }

  forms(match) {
    const found = all(/<form\b[^>]*>[\s\S]*?<\/form>/g, this.main()).map((m) => m[0]);
    return found.filter((form) => match === undefined || form.includes(match) || clean(form).includes(match));
  }

  links(label) {
    return all(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, this.body)
      .filter((m) => clean(m[2]).includes(label))
      .map((m) => unescapeHtml(m[1]));
  }

  hidden(form, name) {
    for (const [tag] of all(/<input\b[^>]*>/g, form)) {
      if (tag.includes(`name="${name}"`)) {
        const value = /value="([^"]*)"/.exec(tag);
        return value ? unescapeHtml(value[1]) : "";
      }
    }
    return null;
  }
}

export class Browser {
  /** Recibe cada respuesta: las suites la usan para buscar secretos en lo que llega al navegador. */
  static onResponse = null;

  /** `headers`: cabeceras que se envían en cada petición, como la `X-Real-IP` que escribiría el proxy. */
  constructor({ headers = {} } = {}) {
    this.cookies = {};
    this.extra = { ...headers };
  }

  request(method, path, { body, headers } = {}) {
    const all = { Accept: "text/html", "User-Agent": "PortalTest/1.0", ...this.extra, ...(headers ?? {}) };
    if (Object.keys(this.cookies).length > 0) all.Cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    if (body !== undefined) all["Content-Length"] = Buffer.byteLength(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ host: HOST, port: PORTS.portal, method, path, headers: all, timeout: 90_000 }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const setCookies = res.headers["set-cookie"] ?? [];
          for (const raw of setCookies) {
            const separator = raw.indexOf("=");
            const name = raw.slice(0, separator).trim();
            const rest = raw.slice(separator + 1);
            const value = rest.split(";", 1)[0];
            if (value === "" || /max-age=0\b/i.test(rest)) delete this.cookies[name];
            else this.cookies[name] = value;
          }
          const response = new Response(res.statusCode, res.headers, Buffer.concat(chunks).toString("utf8"), setCookies, path);
          Browser.onResponse?.(response);
          resolve(response);
        });
      });
      req.on("timeout", () => req.destroy(new Error(`tiempo agotado: ${method} ${path}`)));
      req.on("error", reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
  }

  get(path, options) {
    return this.request("GET", path, options);
  }

  /** Sigue redirecciones internas y devuelve la última respuesta. */
  async follow(response, limit = 5) {
    while ([302, 303, 307, 308].includes(response.status) && response.location && limit > 0) {
      const target = new URL(response.location, BASE);
      response = await this.get(target.pathname + target.search);
      limit--;
    }
    return response;
  }

  /** Envía un formulario ya leído, con sus campos ocultos tal como estaban en la página. */
  postForm(path, form, { fields = {}, replace = {}, origin } = {}) {
    const data = [];
    for (const [tag] of all(/<(?:input|textarea)\b[^>]*>/g, form)) {
      const name = /name="([^"]*)"/.exec(tag);
      if (!name || tag.includes('type="submit"')) continue;
      const value = /value="([^"]*)"/.exec(tag);
      data.push([unescapeHtml(name[1]), value ? unescapeHtml(value[1]) : ""]);
    }
    for (const [key, value] of Object.entries(replace)) for (const item of data) if (item[0] === key) item[1] = value;
    for (const [key, value] of Object.entries(fields)) {
      const hit = data.find((item) => item[0] === key);
      if (hit) hit[1] = value;
      else data.push([key, value]);
    }
    const boundary = `----portaltest${randomBytes(12).toString("hex")}`;
    const body =
      data.map(([n, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`).join("") + `--${boundary}--\r\n`;
    return this.request("POST", path, {
      body,
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, Origin: origin ?? BASE },
    });
  }

  async submit(path, match, options) {
    const page = await this.get(path);
    const forms = page.forms(match);
    if (forms.length === 0) throw new Error(`sin formulario ${JSON.stringify(match)} en ${path} (estado ${page.status}, h1=${JSON.stringify(page.h1())})`);
    return this.postForm(path, forms[0], options);
  }

  token() {
    const entry = Object.entries(this.cookies).find(([name]) => name.includes("portal-session"));
    return entry ? entry[1] : null;
  }
}

/** GET a un simulador: `__test/...` para preparar casos y leer lo que recibió. */
export function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: HOST, port, path, timeout: 20_000 }, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

export const stub = (path) => getJson(PORTS.api, path);
export const orq = (path) => getJson(PORTS.orchestrator, path);

/** Llamada directa al orquestador simulado, para comprobar sus reglas o actuar como otro canal. */
export function orqApi(method, path, { key, grant, assertion, body, idem } = {}) {
  const headers = { Accept: "application/json" };
  if (idem) headers["Idempotency-Key"] = idem;
  if (key) headers.Authorization = `Bearer ${key}`;
  if (grant) headers["X-Journey-Grant"] = grant;
  if (assertion) headers["X-Patient-Assertion"] = assertion;
  let raw;
  if (body !== undefined) {
    raw = typeof body === "string" ? body : JSON.stringify(body);
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(raw);
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORTS.orchestrator, method, path: `/api/v1${path}`, headers, timeout: 20_000 }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolve([res.statusCode, text ? JSON.parse(text) : {}]));
    });
    req.on("error", reject);
    if (raw !== undefined) req.write(raw);
    req.end();
  });
}

/**
 * Demuestra que el portal bajo prueba habla con la API simulada antes de cualquier otra petición:
 * busca una sonda distinta en cada ejecución y comprueba que llega al simulador.
 */
export async function assertWiredToStub() {
  await stub("/__test/reset-calls");
  const probe = `sonda-${randomUUID().slice(0, 10)}`;
  await new Browser().get(`/clinicas/buscar?q=${probe}`);
  const { queries } = await stub("/__test/state");
  if (!queries.some((query) => query.includes(probe))) {
    console.log("ABORTADO: el portal bajo prueba no usa la API simulada");
    process.exit(2);
  }
  console.log(`ok    el portal bajo prueba (${BASE}) usa la API simulada del puerto ${PORTS.api}, no la real`);
  await stub("/__test/reset-calls");
}

/** Inicia sesión con el formulario de /acceso. */
export async function signIn(browser, email, password) {
  const page = await browser.get("/acceso");
  return browser.postForm("/acceso", page.forms('name="email"')[0], { fields: { email, password } });
}
