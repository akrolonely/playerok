// PLAYEROK API — Deno Deploy
// Переменные окружения: BOT_TOKEN, ADMINS (ID через запятую)

const ALLOWED = ["https://akrolonely.github.io", "http://127.0.0.1:8080", "http://localhost:8080"];
const PUBLIC_STATES = new Set(["created", "participant", "claimed", "manager", "cancelled"]);
const ADMIN_STATES = new Set(["paid", "done", "cancelled"]);
const ADMIN_TRANSITIONS = new Set(["created", "participant", "claimed", "paid", "manager", "done", "cancelled"]);

const kv = await Deno.openKv();

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(req) },
  });
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

async function verifyInit(initData: string, botToken: string) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const calc = hex(await hmac(new Uint8Array(secret), check));
  if (calc !== hash) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;
  try {
    const u = JSON.parse(params.get("user") || "{}");
    if (!u.id) return null;
    return {
      id: String(u.id),
      name: [u.first_name, u.last_name].filter(Boolean).join(" ") || "Пользователь",
      username: u.username || "",
    };
  } catch {
    return null;
  }
}

const admins = (env: Record<string, string>) => new Set((env.ADMINS || "").split(",").map((s) => s.trim()).filter(Boolean));

async function notify(env: Record<string, string>, text: string) {
  const token = env.BOT_TOKEN;
  if (!token) return;
  for (const id of admins(env)) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
    } catch { /* сеть недоступна — сделку не теряем */ }
  }
}

const short = (s: string) => String(s || "").slice(0, 120);

function dealText(d: Record<string, unknown>, me: { username: string; id: string }) {
  const who = me.username ? `@${me.username}` : `ID ${me.id}`;
  return `🆕 <b>Сделка #${d.id}</b>\n${d.type === "sell" ? "Продажа" : "Покупка"} · <b>${d.amount} ${d.currency}</b>\n${short(String(d.description))}\nСоздал: ${who}`;
}

async function listDeals(req: Request, env: Record<string, string>, me: { id: string; username: string } | null, isAdmin: boolean) {
  if (!me) return json({ deals: [] }, 200, req);
  const out: Record<string, unknown>[] = [];
  for await (const entry of kv.list({ prefix: ["deal"] })) {
    const d = entry.value as Record<string, unknown>;
    const mine = d.owner_id === me.id ||
      String(d.buyer || "").toLowerCase() === me.username.toLowerCase() ||
      String(d.seller || "").toLowerCase() === me.username.toLowerCase();
    if (isAdmin || mine) out.push(d);
  }
  out.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
  return json({ deals: out }, 200, req);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const env = Deno.env.toObject();

  const auth = req.headers.get("Authorization") || "";
  const me = auth.toLowerCase().startsWith("tma ") ? await verifyInit(auth.slice(4), env.BOT_TOKEN || "") : null;
  const isAdmin = !!me && admins(env).has(me.id);
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/me") {
    return json({ authed: !!me, isAdmin, user: me, guarantor: "PLGiftSend" }, 200, req);
  }

  if (req.method === "GET" && path === "/api/deals") return await listDeals(req, env, me, isAdmin);

  if (req.method === "POST" && path === "/api/deals") {
    if (!me) return json({ error: "unauthorized" }, 401, req);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const amount = Number(body.amount) || 0;
    const description = String(body.description || "").trim();
    if (amount <= 0 || description.length < 5) return json({ error: "invalid_payload" }, 400, req);
    const id = String(body.id || crypto.randomUUID().slice(0, 6)).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const deal = {
      id,
      type: body.type === "sell" ? "sell" : "buy",
      currency: String(body.currency || "GRAM").toUpperCase().slice(0, 8),
      amount,
      description: description.slice(0, 500),
      counterparty: String(body.counterparty || "").replace(/^@/, "").trim().slice(0, 64),
      state: "created",
      owner_id: me.id,
      owner_username: me.username,
      buyer: body.buyer || (body.type === "sell" ? "" : me.username),
      seller: body.seller || (body.type === "sell" ? me.username : ""),
      guarantor: "@PLGiftSend",
      created: Date.now(),
    };
    await kv.set(["deal", id], deal);
    await notify(env, dealText(deal, me));
    return json({ deal }, 200, req);
  }

  const m = path.match(/^\/api\/deals\/([A-Z0-9]+)\/state$/);
  if (req.method === "POST" && m) {
    if (!me) return json({ error: "unauthorized" }, 401, req);
    const id = m[1];
    const rec = await kv.get(["deal", id]);
    if (!rec.value) return json({ error: "not_found" }, 404, req);
    const deal = rec.value as Record<string, unknown>;
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const state = String(body.state || "");
    if (!ADMIN_TRANSITIONS.has(state)) return json({ error: "bad_state" }, 400, req);

    const uname = me.username.toLowerCase();
    const isBuyer = String(deal.buyer || "").toLowerCase() === uname;
    const isSeller = String(deal.seller || "").toLowerCase() === uname;
    const isOwner = deal.owner_id === me.id;
    if (!isAdmin && !isBuyer && !isSeller && !isOwner) return json({ error: "forbidden" }, 403, req);
    if (ADMIN_STATES.has(state) && !isAdmin) return json({ error: "forbidden" }, 403, req);
    if (!isAdmin && PUBLIC_STATES.has(state) && state === "cancelled" && !isBuyer && !isSeller && !isOwner) {
      return json({ error: "forbidden" }, 403, req);
    }

    const prev = String(deal.state);
    deal.state = state;
    deal.updated = Date.now();
    await kv.set(["deal", id], deal);

    if (prev !== state) {
      const who = me.username ? `@${me.username}` : `ID ${me.id}`;
      const label: Record<string, string> = {
        participant: "участник подключён",
        claimed: "покупатель отметил оплату",
        paid: "гарант подтвердил оплату",
        manager: "подарок передан гаранту",
        done: "сделка завершена",
        cancelled: "сделка отменена",
      };
      await notify(env, `⚖️ <b>Сделка #${id}</b>\n${label[state] || state} — ${who}`);
    }
    return json({ deal }, 200, req);
  }

  if (req.method === "GET" && path === "/api/rates") {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,bitcoin,tether,ethereum&vs_currencies=usd").catch(() => null);
    if (r && r.ok) {
      const j = await r.json();
      const map: Record<string, string> = { "the-open-network": "TON", bitcoin: "BTC", tether: "USDT", ethereum: "ETH" };
      const rates: Record<string, number> = {};
      for (const k in map) if (j[k]?.usd) rates[map[k]] = j[k].usd;
      return json({ rates }, 200, req);
    }
    return json({ rates: { TON: 0, BTC: 0, USDT: 1, ETH: 0 } }, 200, req);
  }

  if (path === "/") return new Response("PLAYEROK API", { headers: { "Content-Type": "text/plain; charset=utf-8", ...cors(req) } });
  return json({ error: "not_found" }, 404, req);
});
