const { auth, db, FieldValue } = require("../firebaseAdmin");
const { config } = require("../config");
const check = require("../checkClient");

// ── Yordamchilar ────────────────────────────────────────────────────────────
function digits(s) {
  return String(s || "").replace(/\D/g, "");
}
function localPhone(phone) {
  const d = digits(phone);
  return d.length >= 9 ? d.slice(-9) : d; // Result 9-xonali lokal raqamni kutadi
}
function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ── 1. Firebase Auth: mentor accountini ta'minlash + parol parity ──────────
// Check'dagi bcrypt hash bilan importUsers -> Result paroli = Check paroli.
async function ensureMentorAuth(mentor, email) {
  let uid;
  try {
    uid = (await auth().getUserByEmail(email)).uid; // mavjud account — uid saqlanadi
  } catch {
    uid = mentor._id; // yangi account uchun deterministik uid = Check mentor _id
  }

  if (mentor.passwordHash) {
    // importUsers uid bo'yicha upsert qiladi: yangi yaratadi yoki parolni Check'ga moslaydi
    const res = await auth().importUsers(
      [
        {
          uid,
          email,
          displayName: mentor.fullName,
          passwordHash: Buffer.from(mentor.passwordHash)
        }
      ],
      { hash: { algorithm: "BCRYPT" } }
    );
    if (res.failureCount > 0) {
      const reason = res.errors?.[0]?.error?.message || "noma'lum";
      throw new Error(`importUsers xato (${email}): ${reason}`);
    }
  } else {
    // Hash yo'q bo'lsa — accountni parolsiz bo'lsa-da yaratamiz (parolni buzmaymiz)
    try {
      await auth().getUser(uid);
    } catch {
      await auth().createUser({ uid, email, displayName: mentor.fullName });
    }
  }
  return uid;
}

// ── 2. teachers/{uid} profili (additiv — mavjud profilga tegmaymiz) ─────────
async function ensureTeacherProfile(uid, mentor, phone) {
  const ref = db().doc(`teachers/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      name: mentor.fullName,
      phone,
      role: "teacher",
      checkMentorId: mentor._id,
      syncSource: "coddycheck",
      createdAt: FieldValue.serverTimestamp(),
      syncedAt: FieldValue.serverTimestamp()
    });
  } else {
    // Mavjud o'qituvchining nomi/profiliga tegmaymiz — faqat bog'lanish maydonlari
    await ref.set(
      { checkMentorId: mentor._id, syncSource: "coddycheck", syncedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
}

// ── 3. Guruhlar: checkGroupId bo'yicha upsert (rename ham qo'llab-quvvatlanadi) ─
async function upsertGroups(uid, checkGroups) {
  const col = db().collection(`users/${uid}/groups`);
  const nameByCheckId = {};

  for (const g of checkGroups) {
    nameByCheckId[g._id] = g.name;

    const byCheckId = await col.where("checkGroupId", "==", g._id).limit(1).get();
    if (!byCheckId.empty) {
      const docRef = byCheckId.docs[0].ref;
      const cur = byCheckId.docs[0].data();
      if (cur.name !== g.name) {
        // Check'da rename bo'lgan -> guruh nomini va o'quvchilarning group maydonini yangilaymiz
        await docRef.set({ name: g.name }, { merge: true });
        const studs = await db().collection(`users/${uid}/students`).where("group", "==", cur.name).get();
        if (!studs.empty) {
          const batch = db().batch();
          studs.forEach((s) => batch.update(s.ref, { group: g.name }));
          await batch.commit();
        }
      }
      continue;
    }

    // Result'da qo'lda yaratilgan, shu nomli guruh bo'lsa — uni bog'laymiz (dublikat yaratmaymiz)
    const byName = await col.where("name", "==", g.name).limit(1).get();
    if (!byName.empty) {
      await byName.docs[0].ref.set({ checkGroupId: g._id, syncSource: "coddycheck" }, { merge: true });
      continue;
    }

    // Yangi guruh — Result jadval sozlamalari bo'sh (mentor keyin to'ldiradi)
    await col.add({
      name: g.name,
      weekdays: [],
      lessonStart: "",
      lessonEnd: "",
      telegramChatId: g.chatId || "",
      studentsCount: 0,
      checkGroupId: g._id,
      syncSource: "coddycheck",
      createdAt: FieldValue.serverTimestamp()
    });
  }

  return nameByCheckId;
}

// ── 4. O'quvchilar: faqat IDENTITY yangilanadi, hisob-kitoblarga TEGILMAYDI ──
async function upsertStudents(uid, checkStudents, nameByCheckId) {
  const col = db().collection(`users/${uid}/students`);
  const snap = await col.get();

  const byCheckId = new Map();
  const byNameGroup = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (data.checkStudentId) byCheckId.set(data.checkStudentId, d);
    const key = `${normName(data.name)}|${data.group || ""}`;
    if (!byNameGroup.has(key)) byNameGroup.set(key, d);
  });

  const seen = new Set();
  let batch = db().batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db().batch();
      ops = 0;
    }
  };

  let created = 0;
  let linked = 0;
  let updated = 0;

  for (const s of checkStudents) {
    const groupName = nameByCheckId[s.groupId] || s.groupName || "";

    let docSnap = byCheckId.get(s._id);
    let isLink = false;
    if (!docSnap) {
      docSnap = byNameGroup.get(`${normName(s.fullName)}|${groupName}`);
      if (docSnap) isLink = true;
    }

    if (docSnap) {
      seen.add(docSnap.id);
      const cur = docSnap.data();
      const patch = {
        checkStudentId: s._id,
        checkStatus: s.frozenStatus,
        checkLocked: !!s.isLocked,
        checkActive: true,
        syncSource: "coddycheck",
        syncedAt: FieldValue.serverTimestamp()
      };
      if (cur.name !== s.fullName) patch.name = s.fullName;
      if (cur.group !== groupName) patch.group = groupName;
      // DIQQAT: homeworkScore/attendanceScore/activityScore/coins ga TEGILMAYDI
      batch.set(docSnap.ref, patch, { merge: true });
      ops++;
      if (isLink) linked++;
      else updated++;
    } else {
      const ref = col.doc();
      batch.set(ref, {
        name: s.fullName,
        group: groupName,
        homeworkScore: 0,
        attendanceScore: 0,
        activityScore: 0,
        coins: 0,
        checkStudentId: s._id,
        checkStatus: s.frozenStatus,
        checkLocked: !!s.isLocked,
        checkActive: true,
        syncSource: "coddycheck",
        createdAt: FieldValue.serverTimestamp(),
        syncedAt: FieldValue.serverTimestamp()
      });
      ops++;
      created++;
    }

    if (ops >= 400) await flush();
  }

  // Check'dan endi kelmaydigan (o'chirilgan / muzlatilgan / lead) sync o'quvchilarni
  // Result'dan butunlay O'CHIRAMIZ — ko'rinmasligi uchun, recordlari bilan birga.
  // Faqat Check'dan kelgan (syncSource=coddycheck) o'quvchilar; qo'lda qo'shilganlarga tegmaymiz.
  await flush();
  const toRemove = snap.docs.filter((d) => {
    const data = d.data();
    return data.syncSource === "coddycheck" && data.checkStudentId && !seen.has(d.id);
  });

  let removed = 0;
  for (const d of toRemove) {
    const recs = await db().collection(`users/${uid}/records`).where("studentId", "==", d.id).get();
    const refs = [...recs.docs.map((r) => r.ref), d.ref];
    for (let i = 0; i < refs.length; i += 400) {
      const delBatch = db().batch();
      refs.slice(i, i + 400).forEach((ref) => delBatch.delete(ref));
      await delBatch.commit();
    }
    removed++;
  }

  return { created, linked, updated, removed };
}

async function syncMentor(mentor) {
  const phone = localPhone(mentor.phone);
  if (phone.length !== 9) {
    return { mentor: mentor.fullName, skipped: "telefon raqami 9 xonali emas" };
  }
  const email = `${phone}@${config.resultEmailDomain}`;

  const uid = await ensureMentorAuth(mentor, email);
  await ensureTeacherProfile(uid, mentor, phone);

  const checkGroups = await check.getMentorGroups(mentor._id);
  const nameByCheckId = await upsertGroups(uid, checkGroups);

  const checkStudents = await check.getMentorStudents(mentor._id);
  const stats = await upsertStudents(uid, checkStudents, nameByCheckId);

  return { mentor: mentor.fullName, uid, groups: checkGroups.length, students: checkStudents.length, ...stats };
}

async function pullFromCheck() {
  const mentors = await check.getMentors();
  console.log(`[pull] Check'dan ${mentors.length} ta mentor olindi`);

  const results = [];
  for (const mentor of mentors) {
    try {
      const r = await syncMentor(mentor);
      results.push(r);
      console.log(`[pull] ✓ ${r.mentor}:`, r.skipped ? r.skipped : `guruh=${r.groups}, o'quvchi=${r.students} (yangi:${r.created}, bog'landi:${r.linked}, o'chirildi:${r.removed})`);
    } catch (err) {
      console.error(`[pull] ✗ ${mentor.fullName}:`, err.message);
      results.push({ mentor: mentor.fullName, error: err.message });
    }
  }
  return results;
}

module.exports = { pullFromCheck, syncMentor };
