import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";

const VAPID_SUBJECT = "mailto:admin@fairshare.social";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const { subscriptions, title, body, url } = await req.json();

    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, url });
    const options = { TTL: 86400 };

    const results = await Promise.allSettled(
      subscriptions.map((sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
        webpush.sendNotification(sub, payload, options)
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.statusCode || "unknown");

    return new Response(JSON.stringify({ sent, total: subscriptions.length, failed }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
