const { config } = require("../config");

// finalScore (0-100) -> good | average | poor
function mapStatus(score) {
  if (score >= config.goodMin) return "good";
  if (score >= config.averageMin) return "average";
  return "poor";
}

// Foiz o'rniga so'z: <40 -> "past", 40-59 -> "o'rtacha"
function levelWord(v) {
  return v < 40 ? "past" : "o'rtacha";
}

// average/poor uchun sabab izohi — BITTA GAP, foizsiz, tabiiy so'z bilan.
// Ikki toifa: uy vazifa qilishi ; sinfda qatnashishi (= sinf vazifa + faollik).
function buildReason(status, summary) {
  if (status === "good") return null;

  const weak = [];
  if (summary.avgHw < 60) weak.push(`uy vazifa qilishi ${levelWord(summary.avgHw)}`);

  // sinf vazifa + faollik = sinfda qatnashishi
  const participation = Math.round((Number(summary.avgAtt) + Number(summary.avgAct)) / 2);
  if (participation < 60) weak.push(`sinfda qatnashishi ${levelWord(participation)}`);

  if (!weak.length) return "Umumiy ko'rsatkich o'rtacha.";

  const detail = weak.join(", ");
  return detail.charAt(0).toUpperCase() + detail.slice(1) + ".";
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
