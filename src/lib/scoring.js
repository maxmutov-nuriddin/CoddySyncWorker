const dayjs = require("dayjs");

// ── CoddyResult src/lib/scoring.js dan AYNAN ko'chirilgan ───────────────────
// Natijalar Result UI bilan bir xil bo'lishi uchun o'zgartirmaslik kerak.

function finalScore(student, settings) {
  const hw = Number(settings.homeworkWeight ?? 0.4);
  const result = Number(settings.attendanceWeight ?? 0.3);
  const act = Number(settings.activityWeight ?? 0.3);
  return Math.min(
    100,
    Math.round(
      Number(student.homeworkScore || 0) * hw +
        Number(student.attendanceScore || 0) * result +
        Number(student.activityScore || 0) * act
    )
  );
}

function getRecordsInRange(records, start, end) {
  const s = start.format("YYYY-MM-DD");
  const e = end.format("YYYY-MM-DD");
  return records.filter((record) => {
    const d = dayjs(record.date).format("YYYY-MM-DD");
    return d >= s && d <= e;
  });
}

function getPreviousWeekRange(date = dayjs()) {
  const d = dayjs(date).startOf("day");
  const day = d.day(); // 0 = yakshanba
  const diff = day === 0 ? 13 : day + 6;
  const start = d.subtract(diff, "day").startOf("day");
  const end = start.add(6, "day").endOf("day");
  return { start, end };
}

function getCurrentWeekRange(date = dayjs()) {
  const d = dayjs(date).startOf("day");
  const start = d.subtract((d.day() + 6) % 7, "day").startOf("day");
  return { start, end: d.endOf("day") };
}

// Bitta o'quvchining berilgan oynadagi o'rtacha ballari va finalScore.
// Faqat "active" darslar (hw/att/act dan biri > 0) hisobga olinadi — Result bilan bir xil.
function weeklySummary(studentId, records, settings, range) {
  const studentRecords = records.filter((r) => r.studentId === studentId);
  const periodRecords = getRecordsInRange(studentRecords, range.start, range.end).filter(
    (r) => Number(r.homework) > 0 || Number(r.attendance) > 0 || Number(r.activity) > 0
  );
  if (!periodRecords.length) return null;

  const n = periodRecords.length;
  const avgHw = Math.round(periodRecords.reduce((s, r) => s + Number(r.homework || 0), 0) / n);
  const avgAtt = Math.round(periodRecords.reduce((s, r) => s + Number(r.attendance || 0), 0) / n);
  const avgAct = Math.round(periodRecords.reduce((s, r) => s + Number(r.activity || 0), 0) / n);
  const score = finalScore(
    { homeworkScore: avgHw, attendanceScore: avgAtt, activityScore: avgAct },
    settings
  );
  return { avgHw, avgAtt, avgAct, score, lessons: n };
}

// O'quvchining OXIRGI N ta baholangan darsi bo'yicha o'rtacha va finalScore.
// Sana bo'yicha eng yangi N ta dars olinadi (hafta emas — dars soni bo'yicha).
function lastLessonsSummary(studentId, records, settings, n) {
  const recs = records
    .filter((r) => r.studentId === studentId)
    .filter((r) => Number(r.homework) > 0 || Number(r.attendance) > 0 || Number(r.activity) > 0)
    .sort((a, b) => (String(a.date) > String(b.date) ? -1 : 1)) // yangi -> eski
    .slice(0, n);
  if (!recs.length) return null;

  const c = recs.length;
  const avgHw = Math.round(recs.reduce((s, r) => s + Number(r.homework || 0), 0) / c);
  const avgAtt = Math.round(recs.reduce((s, r) => s + Number(r.attendance || 0), 0) / c);
  const avgAct = Math.round(recs.reduce((s, r) => s + Number(r.activity || 0), 0) / c);
  const score = finalScore(
    { homeworkScore: avgHw, attendanceScore: avgAtt, activityScore: avgAct },
    settings
  );
  return { avgHw, avgAtt, avgAct, score, lessons: c };
}

module.exports = {
  finalScore,
  getRecordsInRange,
  getPreviousWeekRange,
  getCurrentWeekRange,
  weeklySummary,
  lastLessonsSummary
};
