const { config } = require("../config");

// finalScore (0-100) -> good | average | poor
function mapStatus(score) {
  if (score >= config.goodMin) return "good";
  if (score >= config.averageMin) return "average";
  return "poor";
}

// average/poor uchun sabab izohi — BITTA GAP. good uchun izoh SHART EMAS (null).
// Maydon nomlari Result UI bilan bir xil: uy vazifasi, sinf vazifasi, faollik.
function buildReason(status, summary) {
  if (status === "good") return null;

  const weak = [];
  if (summary.avgHw < 60) weak.push(`uy vazifasi ${summary.avgHw}%`);
  if (summary.avgAtt < 60) weak.push(`sinf vazifasi ${summary.avgAtt}%`);
  if (summary.avgAct < 60) weak.push(`faollik ${summary.avgAct}%`);

  const detail = weak.length
    ? weak.join(", ")
    : `uy vazifasi ${summary.avgHw}%, sinf vazifasi ${summary.avgAtt}%, faollik ${summary.avgAct}%`;

  return `Oxirgi ${summary.lessons} dars natijasi ${summary.score} ball — past: ${detail}.`;
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
