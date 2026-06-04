const { db } = require("../firebaseAdmin");
const { config } = require("../config");
const check = require("../checkClient");
const { lastLessonsSummary } = require("../lib/scoring");
const { buildStatusBody } = require("../lib/status");

const DEFAULT_SETTINGS = { homeworkWeight: 0.4, attendanceWeight: 0.3, activityWeight: 0.3 };

async function getSettings(uid) {
  const snap = await db().doc(`users/${uid}/settings/reward-system`).get();
  return snap.exists ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
}

// Mentorning BARCHA recordlari (oxirgi N dars in-memory tanlanadi)
async function getAllRecords(uid) {
  const snap = await db().collection(`users/${uid}/records`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function pushMentor(uid, mentorId, opts = {}) {
  const settings = await getSettings(uid);
  const records = await getAllRecords(uid);

  // har o'quvchining baholangan darslari soni
  const gradedCount = {};
  records.forEach((r) => {
    if (Number(r.homework) > 0 || Number(r.attendance) > 0 || Number(r.activity) > 0) {
      gradedCount[r.studentId] = (gradedCount[r.studentId] || 0) + 1;
    }
  });

  const studsSnap = await db().collection(`users/${uid}/students`).get();
  const students = studsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.checkStudentId && s.checkLocked !== true && s.checkActive !== false);

  let sent = 0;
  let skippedNoData = 0;
  let skippedNoBatch = 0;
  let skippedLocked = 0;
  let notFound = 0;
  const batchUpdates = []; // checkPushedBatch yangilanishi

  for (const s of students) {
    const total = gradedCount[s.id] || 0;
    if (!total) {
      skippedNoData++;
      continue;
    }
    const completedBatches = Math.floor(total / config.lessonBatch);

    // AVTO: faqat yangi 6-lik to'lganda yuboriladi (qayta yubormaslik uchun)
    if (opts.autoOnly && completedBatches <= (s.checkPushedBatch || 0)) {
      skippedNoBatch++;
      continue;
    }

    const summary = lastLessonsSummary(s.id, records, settings, config.lessonBatch);
    if (!summary) {
      skippedNoData++;
      continue;
    }

    const body = buildStatusBody(summary);

    if (config.dryRun) {
      console.log(`[push:dry] ${s.name}: ${body.frozenStatus}${body.comment ? " — " + body.comment : ""}`);
      sent++;
      continue; // dry-da checkPushedBatch yangilanmaydi
    }

    const res = await check.patchStudentStatus(mentorId, s.checkStudentId, body);
    if (res.ok) {
      sent++;
      if (completedBatches !== (s.checkPushedBatch || 0)) {
        batchUpdates.push({ id: s.id, batch: completedBatches });
      }
    } else if (res.skipped === "locked") skippedLocked++;
    else if (res.skipped === "notfound") notFound++;
  }

  // qaysi 6-likgacha yuborilganini saqlaymiz
  for (let i = 0; i < batchUpdates.length; i += 400) {
    const b = db().batch();
    batchUpdates.slice(i, i + 400).forEach((u) =>
      b.set(db().doc(`users/${uid}/students/${u.id}`), { checkPushedBatch: u.batch }, { merge: true })
    );
    await b.commit();
  }

  return { sent, skippedNoData, skippedNoBatch, skippedLocked, notFound, total: students.length };
}

// onlyUid berilsa — faqat shu bitta o'qituvchi (mentor o'zi qo'lda bossa) — HAR DOIM yuboriladi.
// opts.autoOnly=true (cron/avto) — faqat "avtomatik yuborish" YOQILGAN mentorlar.
// Bo'sh + autoOnly emas (admin qo'lda global) — hamma mentor.
async function pushToCheck(onlyUid, opts = {}) {
  console.log(
    `[push] oxirgi ${config.lessonBatch} dars bo'yicha${config.dryRun ? " (DRY RUN)" : ""}${onlyUid ? ` (faqat uid=${onlyUid})` : opts.autoOnly ? " (avto)" : ""}`
  );

  // Sync qilingan o'qituvchilar (checkMentorId bor) bo'yicha yuramiz
  const teachers = await db().collection("teachers").get();
  let synced = teachers.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((t) => t.checkMentorId);
  if (onlyUid) {
    synced = synced.filter((t) => t.uid === onlyUid); // qo'lda bitta mentor — har doim
  } else if (opts.autoOnly) {
    // avto (cron): faqat "avtomatik yuborish" yoqilganlar (default YOQILGAN)
    synced = synced.filter((t) => t.autoPushEnabled !== false);
  }

  console.log(`[push] ${synced.length} ta sync qilingan mentor topildi`);

  const results = [];
  for (const t of synced) {
    try {
      const r = await pushMentor(t.uid, t.checkMentorId, opts);
      results.push({ mentor: t.name || t.uid, ...r });
      console.log(
        `[push] ✓ ${t.name || t.uid}: yuborildi=${r.sent}, 6-lik to'lmagan=${r.skippedNoBatch}, ma'lumot yo'q=${r.skippedNoData}, locked=${r.skippedLocked}, topilmadi=${r.notFound}`
      );
    } catch (err) {
      console.error(`[push] ✗ ${t.name || t.uid}:`, err.message);
      results.push({ mentor: t.name || t.uid, error: err.message });
    }
  }
  return results;
}

module.exports = { pushToCheck, pushMentor };
