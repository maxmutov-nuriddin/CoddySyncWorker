require("dotenv").config();

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`[config] ${name} o'rnatilmagan. .env faylni to'ldiring (.env.example dan ko'chiring).`);
  }
  return String(v).trim();
}

const config = {
  checkApiUrl: (process.env.CHECK_API_URL || "").trim().replace(/\/+$/, ""),
  syncApiKey: (process.env.SYNC_API_KEY || "").trim(),
  // Frontend (Result settings) /run/* ni chaqirishi uchun kam huquqli token.
  // SYNC_API_KEY'dan FARQLI bo'lishi shart — bu faqat sync'ni ishga tushiradi, Check API'ga kira olmaydi.
  workerRunToken: (process.env.WORKER_RUN_TOKEN || "").trim(),

  firebaseServiceAccountPath: (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim(),
  firebaseServiceAccountJson: (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim(),
  firebaseServiceAccountBase64: (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim(),

  resultEmailDomain: (process.env.RESULT_EMAIL_DOMAIN || "oquv-natija.local").trim(),

  goodMin: Number(process.env.GOOD_MIN || 75),
  averageMin: Number(process.env.AVERAGE_MIN || 50),

  weekWindow: (process.env.WEEK_WINDOW || "previous").trim(), // previous | current (eskirgan)
  lessonBatch: Math.max(1, Number(process.env.LESSON_BATCH || 6)), // status oxirgi shuncha dars bo'yicha

  pullCron: process.env.PULL_CRON || "0 3 * * *",
  pushCron: process.env.PUSH_CRON || "0 4 * * 1",
  tz: process.env.TZ || "Asia/Tashkent",

  dryRun: String(process.env.DRY_RUN || "false").toLowerCase() === "true"
};

function assertReady() {
  required("CHECK_API_URL");
  required("SYNC_API_KEY");
  if (
    !config.firebaseServiceAccountPath &&
    !config.firebaseServiceAccountJson &&
    !config.firebaseServiceAccountBase64
  ) {
    throw new Error(
      "[config] Firebase service account topilmadi. FIREBASE_SERVICE_ACCOUNT_BASE64 (tavsiya), FIREBASE_SERVICE_ACCOUNT yoki FIREBASE_SERVICE_ACCOUNT_PATH ni o'rnating."
    );
  }
}

module.exports = { config, assertReady };
