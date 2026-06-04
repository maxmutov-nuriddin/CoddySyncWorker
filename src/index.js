const { assertReady, config } = require("./config");
const { pullFromCheck } = require("./sync/pullFromCheck");
const { pushToCheck } = require("./sync/pushToCheck");

async function main() {
  const cmd = process.argv[2] || "all";
  assertReady();

  console.log(`[worker] buyruq: ${cmd} | Check: ${config.checkApiUrl} | dryRun: ${config.dryRun}`);

  if (cmd === "pull") {
    await pullFromCheck();
  } else if (cmd === "push") {
    await pushToCheck();
  } else if (cmd === "all") {
    await pullFromCheck();
    await pushToCheck();
  } else {
    console.error("Noma'lum buyruq. Foydalanish: node src/index.js [pull|push|all]");
    process.exit(1);
  }

  console.log("[worker] tugadi.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] XATO:", err.message);
  process.exit(1);
});
