const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { config } = require("./config");

function loadServiceAccount() {
  if (config.firebaseServiceAccountJson) {
    return JSON.parse(config.firebaseServiceAccountJson);
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
