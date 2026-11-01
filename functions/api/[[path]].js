const MAX_READS_PER_DAY = 999;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function validClientId(value) {
  if (typeof value !== "string") return null;
  const id = value.toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null;
}

async function clientIdFrom(request, body = null) {
  const url = new URL(request.url);
  return validClientId(url.searchParams.get("client_id") || body?.client_id);
}

async function progressFor(db, clientId) {
  const result = await db.prepare(
    "SELECT day_number, COUNT(*) AS read_count FROM reading_events WHERE client_id = ? GROUP BY day_number"
  ).bind(clientId).all();
  const reads = {};
  for (const row of result.results || []) reads[String(row.day_number)] = Number(row.read_count);
  const values = Object.values(reads);
  return { reads, total_reads: values.reduce((a, b) => a + b, 0), days_read: values.length, has_records: values.length > 0 };
}

async function handle(request, env, path) {
  const db = env.DB;
  if (!db) return json({ error: "D1 database binding DB is not configured." }, 503);
  const method = request.method.toUpperCase();

  if (path === "/api/health" && method === "GET") {
    try {
      await db.prepare("SELECT 1 AS ok").first();
      return json({ status: "ok", database: "connected" });
    } catch {
      return json({ status: "error", database: "unavailable" }, 503);
    }
  }

  if (path === "/api/progress" && method === "GET") {
    const clientId = await clientIdFrom(request);
    if (!clientId) return json({ error: "A valid client_id is required." }, 400);
    return json(await progressFor(db, clientId));
  }

  if (path === "/api/progress/import" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const clientId = validClientId(body.client_id);
    if (!clientId || !body.reads || typeof body.reads !== "object" || Array.isArray(body.reads)) {
      return json({ error: "Valid client_id and reads object are required." }, 400);
    }
    const normalized = [];
    for (const [day, count] of Object.entries(body.reads)) {
      const dayNum = Number(day), readCount = Number(count);
      if (!Number.isInteger(dayNum) || !Number.isInteger(readCount) || dayNum < 1 || dayNum > 30 || readCount < 0 || readCount > MAX_READS_PER_DAY) {
        return json({ error: "Each day must be 1–30 and each count must be 0–999." }, 400);
      }
      if (readCount) normalized.push([dayNum, readCount]);
    }
    const existing = await db.prepare("SELECT 1 FROM reading_events WHERE client_id = ? LIMIT 1").bind(clientId).first();
    if (!existing) {
      const now = new Date().toISOString();
      for (const [dayNum, readCount] of normalized) {
        for (let i = 0; i < readCount; i++) {
          await db.prepare("INSERT INTO reading_events (client_id, day_number, read_at) VALUES (?, ?, ?)").bind(clientId, dayNum, now).run();
        }
      }
    }
    return json(await progressFor(db, clientId));
  }

  if (path === "/api/readings" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const clientId = validClientId(body.client_id);
    const dayNum = Number(body.day);
    if (!clientId || !Number.isInteger(dayNum) || dayNum < 1 || dayNum > 30) {
      return json({ error: "Valid client_id and day (1–30) are required." }, 400);
    }
    const count = await db.prepare("SELECT COUNT(*) AS n FROM reading_events WHERE client_id = ? AND day_number = ?").bind(clientId, dayNum).first();
    if (Number(count?.n || 0) >= MAX_READS_PER_DAY) return json({ error: "Daily reading count limit reached." }, 409);
    await db.prepare("INSERT INTO reading_events (client_id, day_number, read_at) VALUES (?, ?, ?)").bind(clientId, dayNum, new Date().toISOString()).run();
    return json(await progressFor(db, clientId), 201);
  }

  if (path.startsWith("/api/readings/day/") && method === "DELETE") {
    const dayNum = Number(path.slice("/api/readings/day/".length));
    const clientId = await clientIdFrom(request);
    if (!clientId || !Number.isInteger(dayNum) || dayNum < 1 || dayNum > 30) {
      return json({ error: "Valid client_id and day (1–30) are required." }, 400);
    }
    await db.prepare(`DELETE FROM reading_events WHERE id = (SELECT id FROM reading_events WHERE client_id = ? AND day_number = ? ORDER BY id DESC LIMIT 1)`).bind(clientId, dayNum).run();
    return json(await progressFor(db, clientId));
  }

  if (path === "/api/readings" && method === "DELETE") {
    const clientId = await clientIdFrom(request);
    if (!clientId) return json({ error: "A valid client_id is required." }, 400);
    await db.prepare("DELETE FROM reading_events WHERE client_id = ?").bind(clientId).run();
    return json(await progressFor(db, clientId));
  }

  if (path === "/api/history" && method === "GET") {
    const clientId = await clientIdFrom(request);
    if (!clientId) return json({ error: "A valid client_id is required." }, 400);
    const result = await db.prepare("SELECT day_number, read_at FROM reading_events WHERE client_id = ? ORDER BY read_at DESC LIMIT 500").bind(clientId).all();
    return json({ events: (result.results || []).map(row => ({ day: row.day_number, read_at: row.read_at })) });
  }

  return json({ error: "Not found" }, 404);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  return handle(request, env, url.pathname.replace(/\/$/, "") || "/");
}
