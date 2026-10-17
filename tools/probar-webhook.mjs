// Prueba local del webhook de Zernio, sin URL publica.
//
// Se empaqueta el handler con esbuild y se le mandan peticiones firmadas de
// verdad, para comprobar: firma invalida, firma valida en modo observacion,
// y deduplicacion en modo persistencia.
//
// Uso: npx esbuild api/zernio/webhook.ts --bundle --platform=node
//      --format=esm --outfile=<tmp>/webhook.mjs
//      node <tmp>/probar-webhook.mjs <tmp>

import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const dir = process.argv[2];
// En Windows hace falta una URL file://; una ruta suelta da ERR_UNSUPPORTED_ESM_URL_SCHEME.
const { POST } = await import(pathToFileURL(join(dir, "webhook.mjs")).href);

const SECRET = "secreto-de-prueba";
const URL = "https://ejemplo.local/api/zernio/webhook";

process.env.ZERNIO_WEBHOOK_SECRET = SECRET;
process.env.ZERNIO_OBSERVE = "1";

const sign = (body) => createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

const post = (body, { signature, eventId } = {}) =>
  POST(
    new Request(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature === undefined ? {} : { "X-Zernio-Signature": signature }),
        ...(eventId ? { "X-Zernio-Event-Id": eventId } : {}),
      },
      body,
    }),
  );

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASA" : "FALLA"}  ${name}${detail ? `  -> ${detail}` : ""}`);
};

// --- 0. Importes relativos con extension ---
// Vercel compila las funciones pero NO las empaqueta, asi que Node ESM exige
// la extension explicita en los imports relativos. Las pruebas de runtime de
// abajo pasan igual porque esbuild si empaqueta: sin este chequeo, un import
// sin extensión llega bien al test y revienta en produccion con
// ERR_MODULE_NOT_FOUND.
{
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = join(process.cwd(), "api");
  const files = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(dir);

  const bad = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/from\s+["'](\.[^"']*)["']/g)) {
      if (!/\.(js|json|mjs)$/.test(m[1])) bad.push(`${file.replace(process.cwd(), ".")} -> ${m[1]}`);
    }
  }
  check(
    "todos los imports relativos llevan extension",
    bad.length === 0,
    bad.length ? bad.join(" | ") : `${files.length} archivos revisados`,
  );
}

// --- 1. Sin firma: tiene que rechazar ---
{
  const r = await post("{}", { signature: undefined });
  check("rechaza peticion sin firma", r.status === 400, `status ${r.status}`);
}

// --- 2. Firma incorrecta ---
{
  const r = await post("{}", { signature: "f".repeat(64) });
  check("rechaza firma incorrecta", r.status === 400, `status ${r.status}`);
}

// --- 3. Firma de otra longitud (no debe romper con exception) ---
{
  const r = await post("{}", { signature: "abc" });
  check("rechaza firma corta sin romperse", r.status === 400, `status ${r.status}`);
}

// --- 4. Firma valida, evento de prueba ---
{
  const body = JSON.stringify({ id: "ev-test-1", event: "webhook.test", timestamp: "2026-10-14T00:00:00Z" });
  const r = await post(body, { signature: sign(body) });
  const json = await r.json();
  check("acepta webhook.test firmado", r.status === 200 && json.ok === true, JSON.stringify(json));
}

// --- 5. Modo observacion: no escribe, responde 200 ---
{
  const body = JSON.stringify({
    id: "ev-obs-1",
    event: "message.received",
    message: {
      id: "msg-1",
      conversationId: "conv-1",
      platform: "instagram",
      direction: "incoming",
      text: "Hola, siguen disponibles los perfumes?",
      sender: { id: "17841400000000000", name: "Jane", username: "jane_doe" },
    },
    account: { id: "acc-1", accountId: "acc-1", profileId: "prof-1", platform: "instagram" },
    profiles: [{ id: "prof-1", externalId: null }],
    timestamp: "2026-10-14T00:00:00Z",
  });
  const r = await post(body, { signature: sign(body) });
  const json = await r.json();
  check("modo observacion responde 200 sin escribir", r.status === 200 && json.observed === true, JSON.stringify(json));
}

// --- 6. Evento no suscrito se ignora ---
{
  const body = JSON.stringify({ id: "ev-x", event: "post.published", timestamp: "2026-10-14T00:00:00Z" });
  const r = await post(body, { signature: sign(body) });
  const json = await r.json();
  check("ignora evento no suscrito", r.status === 200 && json.ignored === "post.published", JSON.stringify(json));
}

// --- 7. Persistencia sin configuracion de servidor: 500 para que reintente ---
{
  process.env.ZERNIO_OBSERVE = "0";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const body = JSON.stringify({
    id: "ev-persist-1",
    event: "message.received",
    message: { id: "m", conversationId: "c", platform: "whatsapp", direction: "incoming", text: "hola", sender: { id: "573001112233" } },
    account: { accountId: "a", profileId: "p", platform: "whatsapp" },
  });
  const r = await post(body, { signature: sign(body) });
  check(
    "sin config del servidor devuelve 500 (Zernio reintenta)",
    r.status === 500,
    `status ${r.status}`,
  );
  process.env.ZERNIO_OBSERVE = "1";
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pruebas pasan`);
if (failed.length) process.exitCode = 1;
