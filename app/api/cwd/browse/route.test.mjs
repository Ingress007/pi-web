import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST } = await jiti.import("./route.ts");

function createRequest(parentPath, name) {
  return new Request("http://127.0.0.1/api/cwd/browse", {
    method: "POST",
    headers: { "Content-Type": "application/json", Host: "127.0.0.1" },
    body: JSON.stringify({ path: parentPath, name }),
  });
}

test("rejects untrusted or non-JSON creation requests", async () => {
  const crossSiteResponse = await POST(new Request("http://127.0.0.1/api/cwd/browse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "127.0.0.1",
      Origin: "https://example.com",
      "Sec-Fetch-Site": "cross-site",
    },
    body: JSON.stringify({ path: "C:\\", name: "project" }),
  }));
  assert.equal(crossSiteResponse.status, 403);

  const nonJsonResponse = await POST(new Request("http://127.0.0.1/api/cwd/browse", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Host: "127.0.0.1" },
    body: "project",
  }));
  assert.equal(nonJsonResponse.status, 415);
});

test("creates a directory inside the currently browsed path", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-create-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const response = await POST(createRequest(root, "new-project"));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.path, path.join(root, "new-project"));
  await access(data.path);
});

test("rejects nested names and reports existing entries", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-create-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const invalidResponse = await POST(createRequest(root, "../outside"));
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), {
    error: "Directory name must be a single folder name",
  });

  assert.equal((await POST(createRequest(root, "existing"))).status, 200);
  const duplicateResponse = await POST(createRequest(root, "existing"));
  assert.equal(duplicateResponse.status, 409);
  assert.deepEqual(await duplicateResponse.json(), {
    error: "A file or directory with this name already exists",
  });
});
