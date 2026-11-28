import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const tempDir = await mkdtemp(join(tmpdir(), "interview-dojo-sessions-"));
process.env.PRIVATE_DATA_DIR = tempDir;

const { createSession, getSession, isValidSessionId, listSessions, saveSession } = await import(
  "./sessions.ts"
);

describe("sessions 磁碟持久化", () => {
  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("拒絕不合法的 sessionId 格式", () => {
    assert.equal(isValidSessionId("abc12345"), true);
    assert.equal(isValidSessionId("../etc/passwd"), false);
    assert.equal(isValidSessionId("bad/id"), false);
  });

  it("建立場次後可立即從磁碟讀取與列出", async () => {
    const created = await createSession();
    assert.equal(created.id.length, 8);

    const loaded = await getSession(created.id);
    assert.ok(loaded);
    assert.equal(loaded.id, created.id);
    assert.equal(loaded.messages[0]?.role, "system");

    loaded.messages.push({ role: "user", content: "面接を始めてください。", offsetSec: 0 });
    loaded.messages.push({ role: "user", content: "よろしくお願いします。", offsetSec: 3.2 });
    await saveSession(loaded);

    const list = await listSessions();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, created.id);
    assert.equal(list[0]?.turnCount, 1);
  });
});
