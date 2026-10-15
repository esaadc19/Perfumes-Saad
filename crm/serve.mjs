// Servidor estático mínimo para revisar el build de `dist/` en el navegador.
// Uso temporal de desarrollo: `node crm/serve.mjs [puerto]`
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const port = Number(process.argv[2] ?? 4174);
const root = join(process.cwd(), "dist");

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
  ".csv": "text/csv",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  // normalize + strip inicial evita salir de `dist/` con `..`.
  let file = join(root, normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ""));
  try {
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("No encontrado");
  }
}).listen(port, () => console.log(`dist/ en http://localhost:${port}`));