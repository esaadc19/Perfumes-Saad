import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const secret = (readFileSync(".env", "utf8").match(/^ZERNIO_WEBHOOK_SECRET=(.+)$/m) ?? [])[1]?.trim();
const body = JSON.stringify({ id: "prueba-node-001", event: "webhook.test", timestamp: "2026-10-17T22:00:00Z" });
const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");

const res = await fetch("https://perfumes-saad.vercel.app/api/zernio/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Zernio-Signature": signature },
  body,
});
console.log("status:", res.status);
console.log("cuerpo:", await res.text());
