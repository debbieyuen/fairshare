import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  encode as base64url,
} from "https://deno.land/std@0.177.0/encoding/base64url.ts";

const APNS_KEY_P8 = Deno.env.get("APNS_KEY_P8")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_TOPIC = Deno.env.get("APNS_TOPIC") || "social.fairshare.union";
const APNS_HOST = Deno.env.get("APNS_HOST") || "https://api.push.apple.com";

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const lines = pem
    .split("\n")
    .filter((l) => !l.startsWith("-----") && l.trim() !== "");
  const raw = Uint8Array.from(atob(lines.join("")), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

let cachedToken: { jwt: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.jwt;

  const header = base64url(
    new TextEncoder().encode(
      JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })
    )
  );
  const exp = now + 3500;
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({ iss: APNS_TEAM_ID, iat: now, exp })
    )
  );
  const signingInput = new TextEncoder().encode(`${header}.${claims}`);
  const key = await importPrivateKey(APNS_KEY_P8);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signingInput
  );
  const jwt = `${header}.${claims}.${base64url(new Uint8Array(sig))}`;
  cachedToken = { jwt, exp };
  return jwt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const { tokens, title, body, url } = await req.json();

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const jwt = await getApnsJwt();

    const payload = JSON.stringify({
      aps: {
        alert: { title: title || "Union", body: body || "" },
        sound: "default",
        "mutable-content": 1,
      },
      url: url || "/",
    });

    const results = await Promise.allSettled(
      tokens.map(
        async (t: { token: string; platform: string }) => {
          const resp = await fetch(
            `${APNS_HOST}/3/device/${t.token}`,
            {
              method: "POST",
              headers: {
                authorization: `bearer ${jwt}`,
                "apns-topic": APNS_TOPIC,
                "apns-push-type": "alert",
                "apns-priority": "10",
                "apns-expiration": "0",
              },
              body: payload,
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`APNs ${resp.status}: ${err}`);
          }
        }
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "unknown");

    return new Response(
      JSON.stringify({ sent, total: tokens.length, failed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-push-apns error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
