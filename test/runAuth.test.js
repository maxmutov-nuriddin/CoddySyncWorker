const { test } = require("node:test");
const assert = require("node:assert/strict");
const { authorizeRun } = require("../src/runAuth");

const KEYS = { syncApiKey: "server-key", workerRunToken: "" };

function deps({ uid = "teacher-1", role = "teacher", tokenValid = true } = {}) {
  return {
    ...KEYS,
    verifyIdToken: async (token) => {
      if (!tokenValid || token !== "good-token") throw new Error("invalid");
      return { uid };
    },
    getRole: async () => role,
  };
}

test("server key keeps full access including requested uid", async () => {
  // Act
  const r = await authorizeRun({ job: "pull", key: "server-key", requestedUid: "x" }, deps());

  // Assert
  assert.deepEqual(r, { ok: true, uid: "x" });
});

test("rejects request without key or bearer token", async () => {
  const r = await authorizeRun({ job: "push" }, deps());
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test("rejects invalid Firebase ID token", async () => {
  const r = await authorizeRun({ job: "push", bearer: "bad" }, deps({ tokenValid: false }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test("teacher push is forced to own uid even when another uid is requested", async () => {
  const r = await authorizeRun({ job: "push", bearer: "good-token", requestedUid: "someone-else" }, deps());
  assert.deepEqual(r, { ok: true, uid: "teacher-1" });
});

test("teacher cannot run pull or sync", async () => {
  for (const job of ["pull", "sync"]) {
    const r = await authorizeRun({ job, bearer: "good-token" }, deps());
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
  }
});

test("admin can run pull and global push", async () => {
  const pull = await authorizeRun({ job: "pull", bearer: "good-token" }, deps({ role: "admin" }));
  const push = await authorizeRun({ job: "push", bearer: "good-token" }, deps({ role: "admin" }));
  assert.deepEqual(pull, { ok: true, uid: undefined });
  assert.deepEqual(push, { ok: true, uid: undefined });
});

test("legacy WORKER_RUN_TOKEN works only while it is configured", async () => {
  const enabled = await authorizeRun({ job: "push", key: "legacy" }, { ...deps(), workerRunToken: "legacy" });
  const disabled = await authorizeRun({ job: "push", key: "legacy" }, deps());
  assert.equal(enabled.ok, true);
  assert.equal(disabled.ok, false);
});
