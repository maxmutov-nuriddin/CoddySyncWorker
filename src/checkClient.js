const axios = require("axios");
const { config } = require("./config");

// CoddyCheck /api/sync ga ulanuvchi client. Faqat X-Sync-Key bilan, HTTPS orqali.
const http = axios.create({
  baseURL: `${config.checkApiUrl}/api/sync`,
  timeout: 30000,
  headers: { "X-Sync-Key": config.syncApiKey }
});

function unwrap(res) {
  // Check javobi: { success, message, data }
  return res.data?.data;
}

async function getMentors() {
  return unwrap(await http.get("/mentors"));
}

async function getMentorGroups(mentorId) {
  return unwrap(await http.get(`/mentors/${mentorId}/groups`));
}

async function getMentorStudents(mentorId) {
  return unwrap(await http.get(`/mentors/${mentorId}/students`));
}

// Qaytaradi: { ok: true } | { skipped: "locked" | "notfound" } | throw
async function patchStudentStatus(mentorId, studentId, body) {
  try {
    await http.patch(`/mentors/${mentorId}/students/${studentId}/status`, body);
    return { ok: true };
  } catch (err) {
    const status = err.response?.status;
    if (status === 403) return { skipped: "locked" }; // Check himoyasi: locked status
    if (status === 404) return { skipped: "notfound" };
    throw err;
  }
}

module.exports = { http, getMentors, getMentorGroups, getMentorStudents, patchStudentStatus };
