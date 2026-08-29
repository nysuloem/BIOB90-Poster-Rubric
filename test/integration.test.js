const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not become ready.");
}

async function json(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

test("complete judging and organizer workflow", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "biob90-rubric-"));
  const port = 32000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), DATA_PATH: path.join(tempDir, "test.json"), ADMIN_PASSWORD: "test-secret" },
    stdio: "ignore"
  });
  t.after(() => {
    child.kill("SIGTERM");
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  let result = await json(baseUrl, "/api/rubric");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.totalCriteria, 20);
  const criterionIds = result.data.sections.flatMap((section) => section.criteria.map((criterion) => criterion.id));

  const landingPage = await fetch(`${baseUrl}/`);
  assert.match(await landingPage.text(), /How are you using the rubric/);
  const studentPage = await fetch(`${baseUrl}/student.html`);
  const studentHtml = await studentPage.text();
  assert.match(studentHtml, /Student view/);
  assert.match(studentHtml, /at least 16 of the 20 criteria/);
  result = await json(baseUrl, "/api/judges/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ judgeName: "Future Judge" })
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.data.error, "Judge not found.");

  result = await json(baseUrl, "/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posterNumber: "17", judgeName: "Test Judge" })
  });
  assert.equal(result.response.status, 201);
  const { id, token } = result.data;
  const answers = criterionIds.map((criterionId, index) => ({
    criterionId,
    response: index % 3 === 0 ? "no" : "yes",
    comment: index === 0 ? "Helpful test comment" : ""
  }));

  result = await json(baseUrl, `/api/submissions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Edit-Token": token },
    body: JSON.stringify({ posterNumber: "17", judgeName: "Test Judge", answers: answers.slice(0, 5), status: "draft" })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.submission.answers.filter((answer) => answer.response).length, 5);

  result = await json(baseUrl, `/api/submissions/${id}`, { headers: { "X-Edit-Token": token } });
  assert.equal(result.data.submission.answers.find((answer) => answer.criterionId === criterionIds[0]).comment, "Helpful test comment");

  result = await json(baseUrl, `/api/submissions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Edit-Token": token },
    body: JSON.stringify({ posterNumber: "17", judgeName: "Test Judge", answers, status: "submitted" })
  });
  assert.equal(result.data.submission.status, "submitted");

  result = await json(baseUrl, "/api/admin/submissions", { headers: { Authorization: "Bearer wrong" } });
  assert.equal(result.response.status, 401);
  result = await json(baseUrl, "/api/admin/submissions", { headers: { Authorization: "Bearer test-secret" } });
  assert.equal(result.data.submissions.length, 1);

  const csvResponse = await fetch(`${baseUrl}/api/admin/export.csv`, { headers: { Authorization: "Bearer test-secret" } });
  const csv = await csvResponse.text();
  assert.equal(csvResponse.status, 200);
  assert.match(csv, /Helpful test comment/);
  assert.equal(csv.trim().split(/\r?\n/).length, 21);
  const stored = JSON.parse(fs.readFileSync(path.join(tempDir, "test.json"), "utf8"));
  assert.equal(stored.submissions.length, 1);
  assert.equal(stored.submissions[0].status, "submitted");
});
