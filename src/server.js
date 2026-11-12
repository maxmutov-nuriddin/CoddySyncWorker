const http = require("http");
const { URL } = require("url");
const cron = require("node-cron");
const { assertReady, config } = require("./config");
const { pullFromCheck } = require("./sync/pullFromCheck");
const { pushToCheck } = require("./sync/pushToCheck");
const { auth, db } = require("./firebaseAdmin");
const { authorizeRun, bearerFrom } = require("./runAuth");

const runAuthDeps = {
  syncApiKey: config.syncApiKey,
  workerRunToken: config.workerRunToken,
  verifyIdToken: (token) => auth().verifyIdToken(token),
  getRole: async (uid) => (await db().doc(`teachers/${uid}`).get()).data()?.role,
};

// Render Web Service uchun: HTTP port ochadi (health) + sync'ni cron yoki
// tashqi ping orqali ishga tushiradi.
assertReady();

const PORT = Number(process.env.PORT) || 10000;

let running = false;
let lastRun = null;

async function runJob(name, uid, opts = {}) {
  if (running) return { skipped: "allaqachon ishlayapti" };
  running = true;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    console.log(`[job] ${name} boshlandi${uid ? ` (uid=${uid})` : opts.autoOnly ? " (avto)" : ""}`);
    if (name === "pull") await pullFromCheck();
    else if (name === "push") await pushToCheck(uid, opts);
    else {
      await pullFromCheck();
      await pushToCheck(uid, opts);
    }
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    lastRun = { name, startedAt, seconds, ok: true };
    console.log(`[job] ${name} tugadi (${seconds}s)`);
  } catch (err) {
    lastRun = { name, startedAt, ok: false, error: err.message };
    console.error(`[job] ${name} XATO:`, err.message);
  } finally {
    running = false;
  }
}

function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    // Result frontend (boshqa origin) /run/* ni chaqira olishi uchun
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    return send(res, 400, { ok: false });
  }
  const path = parsed.pathname;

  // CORS preflight (frontend fetch uchun)
  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  // Render health check + keep-alive
  if (path === "/" || path === "/health") {
    return send(res, 200, { ok: true, service: "coddy-sync-worker", running, lastRun });
  }

  // Tashqi scheduler (cron-job.org) yoki Result sozlamalaridagi tugma shu yerga uradi:
  //   /run/pull?key=...  /run/push?key=...  /run/sync?key=...
  if (path.startsWith("/run/")) {
    const job = path.split("/")[2];
    if (!["pull", "push", "sync"].includes(job)) {
      return send(res, 404, { ok: false, error: "noma'lum job (pull|push|sync)" });
    }
    // Ruxsat qoidalari: src/runAuth.js (server kaliti / Firebase ID token)
    let access;
    try {
      access = await authorizeRun({
        job,
        key: parsed.searchParams.get("key") || req.headers["x-sync-key"],
        bearer: bearerFrom(req.headers.authorization),
        requestedUid: parsed.searchParams.get("uid") || undefined,
      }, runAuthDeps);
    } catch (err) {
      console.error("[run] auth xato:", err.message);
      return send(res, 500, { ok: false, error: "ruxsatni tekshirib bo'lmadi" });
    }
    if (!access.ok) {
      return send(res, access.status, { ok: false, error: access.error });
    }
    if (running) {
      return send(res, 409, { ok: false, error: "allaqachon ishlayapti", running: true });
    }
    // push uchun uid — faqat shu mentor natijasini yuboradi (teacher uchun doim o'z uid'i)
    const uid = access.uid;
    // Uzoq ishni kutmaymiz — darhol javob, ish fonda ketadi (HTTP timeout bo'lmasin)
    runJob(job, uid);
    return send(res, 202, { ok: true, started: job, uid: uid || null });
  }

  return send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[server] tinglayapti :${PORT} | Check: ${config.checkApiUrl} | dryRun: ${config.dryRun}`);
});

// Ichki cron — service UYG'OQ bo'lganda ishlaydi.
// Bepul Render uxlab qolsa ishlamaydi -> tashqi ping (/run/...) ishlating.
cron.schedule(config.pullCron, () => runJob("pull"), { timezone: config.tz });
// Avto push — faqat "avtomatik yuborish" yoqilgan mentorlar
cron.schedule(config.pushCron, () => runJob("push", undefined, { autoOnly: true }), { timezone: config.tz });

console.log(`[cron] pull: "${config.pullCron}", push: "${config.pushCron}", TZ: ${config.tz}`);
