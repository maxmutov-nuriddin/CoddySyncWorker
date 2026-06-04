const dayjs = require("dayjs");
const { db } = require("../firebaseAdmin");
const { config } = require("../config");
const check = require("../checkClient");
const { getPreviousWeekRange, getCurrentWeekRange, weeklySummary } = require("../lib/scoring");
const { buildStatusBody } = require("../lib/status");

const DEFAULT_SETTINGS = { homeworkWeight: 0.4, attendanceWeight: 0.3, activityWeight: 0.3 };

function weekRange() {
  return config.weekWindow === "current" ? getCurrentWeekRange() : getPreviousWeekRange();
}

async function getSettings(uid) {
  const snap = await db().doc(`users/${uid}/settings/reward-system`).get();
  return snap.exists ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
}

// Oynaga tushadigan recordlarni olib kelamiz (date "YYYY-MM-DD" string)
async function getRecords(uid, range) {
  const start = range.start.format("YYYY-MM-DD");
  const end = range.end.format("YYYY-MM-DD");
  const snap = await db()
    .collection(`users/${uid}/records`)
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function pushMentor(uid, mentorId, range) {
  const settings = await getSettings(uid);
  const records = await getRecords(uid, range);

  const studsSnap = await db().collection(`users/${uid}/students`).get();
  const students = studsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.checkStudentId && s.checkLocked !== true && s.checkActive !== false);

  let sent = 0;
  let skippedNoData = 0;
  let skippedLocked = 0;
  let notFound = 0;

  for (const s of students) {
    const summary = weeklySummary(s.id, records, settings, range);
    if (!summary) {
      skippedNoData++;
      continue; // bu hafta darsi/bahosi yo'q -> taxmin qilmaymiz
    }

    const body = buildStatusBody(summary);

    if (config.dryRun) {
      console.log(`[push:dry] ${s.name}: ${body.frozenStatus}${body.comment ? " — " + body.comment : ""}`);
      sent++;
      continue;
    }

    const res = await check.patchStudentStatus(mentorId, s.checkStudentId, body);
    if (res.ok) sent++;
    else if (res.skipped === "locked") skippedLocked++;
    else if (res.skipped === "notfound") notFound++;
  }

  return { sent, skippedNoData, skippedLocked, notFound, total: students.length };
}

async function pushToCheck() {
  const range = weekRange();
  console.log(
    `[push] hafta oynasi: ${range.start.format("YYYY-MM-DD")} .. ${range.end.format("YYYY-MM-DD")}${config.dryRun ? " (DRY RUN)" : ""}`
  );

  // Sync qilingan o'qituvchilar (checkMentorId bor) bo'yicha yuramiz
  const teachers = await db().collection("teachers").get();
  const synced = teachers.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((t) => t.checkMentorId);

  console.log(`[push] ${synced.length} ta sync qilingan mentor topildi`);

  const results = [];
  for (const t of synced) {
    try {
      const r = await pushMentor(t.uid, t.checkMentorId, range);
      results.push({ mentor: t.name || t.uid, ...r });
      console.log(
        `[push] ✓ ${t.name || t.uid}: yuborildi=${r.sent}, ma'lumot yo'q=${r.skippedNoData}, locked=${r.skippedLocked}, topilmadi=${r.notFound}`
      );
    } catch (err) {
      console.error(`[push] ✗ ${t.name || t.uid}:`, err.message);
      results.push({ mentor: t.name || t.uid, error: err.message });
    }
  }
  return results;
}

module.exports = { pushToCheck, pushMentor };
