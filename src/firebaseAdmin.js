const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { config } = require("./config");

function parseJsonOrThrow(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[firebase] ${source} ichidagi JSON noto'g'ri (${err.message}). ` +
        `Render'da FIREBASE_SERVICE_ACCOUNT_BASE64 ishlatish tavsiya etiladi.`
    );
  }
}

function loadServiceAccount() {
  // 1-variant (eng ishonchli): base64 — qo'shtirnoq/\n muammosi bo'lmaydi
  if (config.firebaseServiceAccountBase64) {
    const decoded = Buffer.from(config.firebaseServiceAccountBase64, "base64").toString("utf8");
    return parseJsonOrThrow(decoded, "FIREBASE_SERVICE_ACCOUNT_BASE64");
  }
  if (config.firebaseServiceAccountJson) {
    return parseJsonOrThrow(config.firebaseServiceAccountJson, "FIREBASE_SERVICE_ACCOUNT");
  }
  if (config.firebaseServiceAccountPath) {
    const abs = path.isAbsolute(config.firebaseServiceAccountPath)
      ? config.firebaseServiceAccountPath
      : path.join(process.cwd(), config.firebaseServiceAccountPath);
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  }
  throw new Error("[firebase] Service account topilmadi.");
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
