// /run/* ruxsat qoidalari.
//
//  • SYNC_API_KEY (server ↔ server, masalan cron-job.org) — to'liq huquq, ?uid= ham ishlaydi.
//  • WORKER_RUN_TOKEN (eski, frontend bundle'ida ochiq qolgan) — faqat .env da berilgan bo'lsa ishlaydi.
//    Yangi frontend chiqqach Render'dan O'CHIRING.
//  • Firebase ID token (Authorization: Bearer ...) — Result frontend:
//      teacher → faqat push va faqat O'Z uid'i (boshqa uid so'rasa ham o'ziniki ishlatiladi);
//      admin   → pull / push / sync, ?uid= ixtiyoriy.

const FULL_ACCESS = (uid) => ({ ok: true, uid });
const DENY = (status, error) => ({ ok: false, status, error });

/**
 * @param {{ job: string, key?: string, bearer?: string, requestedUid?: string }} req
 * @param {{ syncApiKey: string, workerRunToken: string,
 *           verifyIdToken: (token: string) => Promise<{ uid: string }>,
 *           getRole: (uid: string) => Promise<string | undefined> }} deps
 * @returns {Promise<{ ok: true, uid?: string } | { ok: false, status: number, error: string }>}
 */
async function authorizeRun({ job, key, bearer, requestedUid }, deps) {
  if (key && key === deps.syncApiKey) return FULL_ACCESS(requestedUid);
  if (key && deps.workerRunToken && key === deps.workerRunToken) return FULL_ACCESS(requestedUid);

  if (!bearer) return DENY(401, "avtorizatsiya kerak");

  let decoded;
  try {
    decoded = await deps.verifyIdToken(bearer);
  } catch {
    return DENY(401, "token yaroqsiz yoki muddati o'tgan");
  }

  const role = await deps.getRole(decoded.uid);
  if (role === "admin") return FULL_ACCESS(requestedUid);
  if (job !== "push") return DENY(403, "bu amal faqat admin uchun");
  return FULL_ACCESS(decoded.uid);
}

function bearerFrom(header) {
  const value = String(header || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

module.exports = { authorizeRun, bearerFrom };
