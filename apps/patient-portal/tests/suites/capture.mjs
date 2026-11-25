// Paso previo de la suite del orquestador. Con el portal en modo heredado, guarda los formularios de las acciones
// que el modo orquestador oculta, para comprobar después que el servidor las rechaza aunque alguien las envíe a mano.
// Los guarda en la carpeta temporal de la ejecución.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, assertWiredToStub, signIn } from "../lib/client.mjs";
import { DIRS, IDS } from "../lib/config.mjs";
import { check, finish } from "../lib/report.mjs";
import { testPassword } from "../lib/secrets.mjs";

const { GLUCOSA, ALAMEDA } = IDS;

await assertWiredToStub();
const ana = new Browser();
const signed = await signIn(ana, "ana@example.com", testPassword());
check("acceso", signed.status === 303, signed.status);
const page = await ana.get(`/tramite/nuevo?estudio=${GLUCOSA}`);
const created = await ana.postForm(page.path, page.forms("Empezar")[0]);
const P = /\/tramite\/[0-9a-f-]{36}/.exec(created.location)[0];
const forms = {};
forms.pausa = (await ana.get(P)).forms("Guardar y continuar después")[0];
await ana.submit(P, ALAMEDA);
forms.horario = (await ana.get(P)).forms('name="scheduledAt"')[0];
await ana.postForm(P, forms.horario);
const review = await ana.get(P);
forms.nota = review.forms('name="notes"')[0];
forms.confirmar = review.forms("Confirmar mi cita")[0];
forms.ayuda = review.forms("Pedir ayuda a un asesor")[0];
forms.reanudar = (await ana.get("/continuar")).forms("Continuar este trámite")[0];
writeFileSync(join(DIRS.work, "formularios-heredados.json"), JSON.stringify(forms));
const listing = (await ana.get("/continuar")).text();
const shown = review.text();
check(
  "modo heredado, sin códigos de continuidad en /continuar ni en el trámite",
  !listing.includes("Tengo un código de continuidad") && !shown.includes("Continuar en otro canal") && !shown.includes("Generar código"),
);
check("formularios guardados: los seis", Object.values(forms).every(Boolean), Object.keys(forms).sort());
finish();
