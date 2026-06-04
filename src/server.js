const http = require("http");
const { URL } = require("url");
const cron = require("node-cron");
const { assertReady, config } = require("./config");
const { pullFromCheck } = require("./sync/pullFromCheck");
const { pushToCheck } = require("./sync/pushToCheck");

// Render Web Service uchun: HTTP port ochadi (health) + sync'ni cron yoki
// tashqi ping orqali ishga tushiradi.
assertReady();

const PORT = Number(process.env.PORT) || 10000;

let running = false;
let lastRun = null;

async function runJob(name) {
  if (running) return { skipped: "allaqachon ishlayapti" };
  running = true;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    console.log(`[job] ${name} boshlandi`);
    if (name === "pull") await pullFromCheck();
    else if (name === "push") await pushToCheck();
    else {
      await pullFromCheck();
      await pushToCheck();
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
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
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
    const key = parsed.searchParams.get("key") || req.headers["x-sync-key"];
    // SYNC_API_KEY (to'liq) yoki WORKER_RUN_TOKEN (faqat /run/* — frontend uchun xavfsiz)
    const allowed = key === config.syncApiKey || (config.workerRunToken && key === config.workerRunToken);
    if (!allowed) {
      return send(res, 401, { ok: false, error: "noto'g'ri key" });
    }
    const job = path.split("/")[2];
    if (!["pull", "push", "sync"].includes(job)) {
      return send(res, 404, { ok: false, error: "noma'lum job (pull|push|sync)" });
    }
    if (running) {
      return send(res, 409, { ok: false, error: "allaqachon ishlayapti", running: true });
    }
    // Uzoq ishni kutmaymiz — darhol javob, ish fonda ketadi (HTTP timeout bo'lmasin)
    runJob(job);
    return send(res, 202, { ok: true, started: job });
  }

  return send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[server] tinglayapti :${PORT} | Check: ${config.checkApiUrl} | dryRun: ${config.dryRun}`);
});

// Ichki cron — service UYG'OQ bo'lganda ishlaydi.
// Bepul Render uxlab qolsa ishlamaydi -> tashqi ping (/run/...) ishlating.
cron.schedule(config.pullCron, () => runJob("pull"), { timezone: config.tz });
cron.schedule(config.pushCron, () => runJob("push"), { timezone: config.tz });

console.log(`[cron] pull: "${config.pullCron}", push: "${config.pushCron}", TZ: ${config.tz}`);
