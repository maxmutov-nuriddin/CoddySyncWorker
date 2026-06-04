const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { config } = require("./config");

// Yaroqli service account ekanini tekshiradi (shunchaki JSON emas)
function isValidSA(sa) {
  return sa && typeof sa === "object" && sa.client_email && sa.private_key;
}

// Har bir manbani SINAB ko'radi; biri buzilgan bo'lsa o'tkazib yuborib,
// keyingisiga o'tadi. Hammasi muvaffaqiyatsiz bo'lsagina xato beradi.
// Shu sabab Render'dagi eski/buzilgan o'zgaruvchilar Secret File'ga xalaqit bermaydi.
function loadServiceAccount() {
  const sources = [];

  if (config.firebaseServiceAccountBase64) {
    sources.push([
      "FIREBASE_SERVICE_ACCOUNT_BASE64",
      () => JSON.parse(Buffer.from(config.firebaseServiceAccountBase64, "base64").toString("utf8"))
    ]);
  }
  if (config.firebaseServiceAccountJson) {
    sources.push(["FIREBASE_SERVICE_ACCOUNT", () => JSON.parse(config.firebaseServiceAccountJson)]);
  }
  if (config.firebaseServiceAccountPath) {
    sources.push([
      "FIREBASE_SERVICE_ACCOUNT_PATH",
      () => {
        const abs = path.isAbsolute(config.firebaseServiceAccountPath)
          ? config.firebaseServiceAccountPath
          : path.join(process.cwd(), config.firebaseServiceAccountPath);
        return JSON.parse(fs.readFileSync(abs, "utf8"));
      }
    ]);
  }

  const failures = [];
  for (const [name, load] of sources) {
    try {
      const sa = load();
      if (!isValidSA(sa)) {
        failures.push(`${name}: client_email/private_key yo'q`);
        continue;
      }
      if (failures.length) {
        console.warn(`[firebase] ${name} ishlatildi (oldingilari yaroqsiz: ${failures.join("; ")})`);
      }
      return sa;
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  }

  throw new Error(
    failures.length
      ? `[firebase] Hech qaysi service account manbasi yaroqli emas -> ${failures.join(" | ")}`
      : "[firebase] Service account topilmadi (BASE64 / JSON / PATH dan birini o'rnating)."
  );
}

let _app = null;
function getApp() {
  if (_app) return _app;
  _app = admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount())
  });
  return _app;
}

const auth = () => admin.auth(getApp());
const db = () => admin.firestore(getApp());
const FieldValue = admin.firestore.FieldValue;

module.exports = { admin, getApp, auth, db, FieldValue };
