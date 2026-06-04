const cron = require("node-cron");
const { assertReady, config } = require("./config");
const { pullFromCheck } = require("./sync/pullFromCheck");
const { pushToCheck } = require("./sync/pushToCheck");

assertReady();

let running = false;
async function runSafe(name, fn) {
  if (running) {
    console.warn(`[cron] ${name} o'tkazib yuborildi — oldingi job hali tugamadi`);
    return;
  }
  running = true;
  const t0 = Date.now();
  try {
    console.log(`[cron] ${name} boshlandi`);
    await fn();
    console.log(`[cron] ${name} tugadi (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.error(`[cron] ${name} XATO:`, err.message);
  } finally {
    running = false;
  }
}

// Kunlik: Check -> Result (mentor/guruh/o'quvchi)
cron.schedule(config.pullCron, () => runSafe("pull", pullFromCheck), { timezone: config.tz });

// Haftalik: Result -> Check (status write-back)
cron.schedule(config.pushCron, () => runSafe("push", pushToCheck), { timezone: config.tz });

console.log(
  `[cron] ishga tushdi. pull: "${config.pullCron}", push: "${config.pushCron}", TZ: ${config.tz}, dryRun: ${config.dryRun}`
);
