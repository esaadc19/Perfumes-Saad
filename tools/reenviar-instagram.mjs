// Reenvia al webhook desplegado un payload REAL capturado de produccion.
//
// Uso: node tools/reenviar-instagram.mjs ["texto nuevo"]
//
// Sirve para probar la persistencia sin esperar un DM de verdad. El id de
// evento se cambia solo, porque Zernio ya consumio el original y la
// deduplicacion lo rechazaria.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const secret = (readFileSync(".env", "utf8").match(/^ZERNIO_WEBHOOK_SECRET=(.+)$/m) ?? [])[1]?.trim();
if (!secret) throw new Error("Falta ZERNIO_WEBHOOK_SECRET en el .env");

const texto = process.argv[2] ?? "Hola, sigue disponible el Jean Paul Gaultier?";

const payload = {
  id: crypto.randomUUID(),
  event: "message.received",
  message: {
    id: `msg-prueba-${Date.now()}`,
    conversationId: "6acf97bfd099476b1c2da084",
    platform: "instagram",
    direction: "incoming",
    text: texto,
    sender: {
      id: "1152905440512086",
      name: "Elias David Saad",
      username: "eliassaadc",
      contactId: "6ad3da3b06890d0565eaa78f",
      instagramProfile: { isFollower: true, isFollowing: true, followerCount: 559, isVerified: false },
    },
  },
  conversation: { id: "6acf97bfd099476b1c2da084", status: "active" },
  account: {
    id: "6acf97aae02f4d6f5b8d209e",
    accountId: "6acf97aae02f4d6f5b8d209e",
    profileId: "6abac8f53748aaf8b725fec5",
    platform: "instagram",
  },
  profiles: [{ id: "6abac8f53748aaf8b725fec5", externalId: null }],
  timestamp: new Date().toISOString(),
};

const body = JSON.stringify(payload);
const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");

const res = await fetch("https://perfumes-saad.vercel.app/api/zernio/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Zernio-Signature": signature },
  body,
});

console.log("evento:", payload.id);
console.log("status:", res.status);
console.log("respuesta:", await res.text());

// Segundo envio con el MISMO id de evento: tiene que salir como duplicado.
const res2 = await fetch("https://perfumes-saad.vercel.app/api/zernio/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Zernio-Signature": signature },
  body,
});
console.log("reintento status:", res2.status);
console.log("reintento:", await res2.text());