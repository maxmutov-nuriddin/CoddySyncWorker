const { config } = require("../config");

// finalScore (0-100) -> good | average | poor
function mapStatus(score) {
  if (score >= config.goodMin) return "good";
  if (score >= config.averageMin) return "average";
  return "poor";
}

// average/poor uchun sabab izohi tuziladi. good uchun izoh SHART EMAS (null qaytadi).
function buildReason(status, summary) {
  if (status === "good") return null;

  const weak = [];
  if (summary.avgHw < 60) weak.push(`uy vazifasi ${summary.avgHw}%`);
  if (summary.avgAtt < 70) weak.push(`davomat ${summary.avgAtt}%`);
  if (summary.avgAct < 60) weak.push(`faollik ${summary.avgAct}%`);

  const head = `Haftalik natija: ${summary.score} ball (${summary.lessons} dars).`;
  if (weak.length) {
    return `${head} Past ko'rsatkichlar: ${weak.join(", ")}.`;
  }
  // Hammasi nisbatan o'rtacha bo'lsa
  return `${head} Umumiy ko'rsatkich past: uy vazifasi ${summary.avgHw}%, davomat ${summary.avgAtt}%, faollik ${summary.avgAct}%.`;
}

// Check'ga yuboriladigan body'ni tayyorlaydi.
// good bo'lsa comment YUBORILMAYDI (mavjud izohga tegmaslik uchun).
function buildStatusBody(summary) {
  const status = mapStatus(summary.score);
  const body = { frozenStatus: status };
  const reason = buildReason(status, summary);
  if (reason !== null) body.comment = reason;
  return body;
}

module.exports = { mapStatus, buildReason, buildStatusBody };
