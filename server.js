const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { rubric, criterionIds } = require("./rubric");

const app = express();
const port = Number(process.env.PORT || 3000);
const dataPath = process.env.DATA_PATH || process.env.DB_PATH || path.join(__dirname, "data", "rubric.json");
const adminPassword = process.env.ADMIN_PASSWORD || "";

fs.mkdirSync(path.dirname(dataPath), { recursive: true });

function loadStore() {
  if (!fs.existsSync(dataPath)) return { schemaVersion: 1, submissions: [] };
  const parsed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!parsed || !Array.isArray(parsed.submissions)) throw new Error(`Invalid rubric data file: ${dataPath}`);
  return parsed;
}

const store = loadStore();

function persistStore() {
  const temporaryPath = `${dataPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, dataPath);
}

if (!fs.existsSync(dataPath)) persistStore();

app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function getSubmission(id) {
  return store.submissions.find((submission) => submission.id === id) || null;
}

function publicSubmission(submission) {
  return {
    id: submission.id,
    posterNumber: submission.poster_number,
    judgeName: submission.judge_name,
    status: submission.status,
    createdAt: submission.created_at,
    updatedAt: submission.updated_at,
    submittedAt: submission.submitted_at,
    answers: submission.answers.map((answer) => ({
      criterionId: answer.criterion_id,
      response: answer.response,
      comment: answer.comment
    }))
  };
}

function verifyEditToken(req, submission) {
  const token = req.get("X-Edit-Token") || req.query.token || "";
  return token && safeEqual(hash(token), submission.edit_token_hash);
}

function requireAdmin(req, res, next) {
  if (!adminPassword) {
    return res.status(503).json({ error: "Organizer access has not been configured." });
  }
  const authorization = req.get("Authorization") || "";
  const password = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!password || !safeEqual(password, adminPassword)) {
    return res.status(401).json({ error: "Incorrect admin password." });
  }
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/rubric", (_req, res) => res.json({ title: "BIOB90 Biology Integrative Research Poster Project", sections: rubric, totalCriteria: criterionIds.length }));

app.post("/api/submissions", (req, res) => {
  const posterNumber = cleanText(req.body.posterNumber, 80);
  const judgeName = cleanText(req.body.judgeName, 120);
  if (!posterNumber || !judgeName) return res.status(400).json({ error: "Poster number and judge name are required." });

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const submission = {
    id,
    edit_token_hash: hash(token),
    poster_number: posterNumber,
    judge_name: judgeName,
    status: "draft",
    created_at: now,
    updated_at: now,
    submitted_at: null,
    answers: criterionIds.map((criterionId) => ({ criterion_id: criterionId, response: null, comment: "" }))
  };
  store.submissions.push(submission);
  persistStore();
  res.status(201).json({ id, token, submission: publicSubmission(submission) });
});

app.get("/api/submissions/:id", (req, res) => {
  const submission = getSubmission(req.params.id);
  if (!submission) return res.status(404).json({ error: "Review not found." });
  if (!verifyEditToken(req, submission)) return res.status(403).json({ error: "This review cannot be opened on this device." });
  res.json({ submission: publicSubmission(submission) });
});

app.put("/api/submissions/:id", (req, res) => {
  const submission = getSubmission(req.params.id);
  if (!submission) return res.status(404).json({ error: "Review not found." });
  if (!verifyEditToken(req, submission)) return res.status(403).json({ error: "This review cannot be edited on this device." });
  if (submission.status === "submitted") return res.status(409).json({ error: "This review has already been submitted." });

  const posterNumber = cleanText(req.body.posterNumber, 80);
  const judgeName = cleanText(req.body.judgeName, 120);
  const requestedStatus = req.body.status === "submitted" ? "submitted" : "draft";
  const incoming = Array.isArray(req.body.answers) ? req.body.answers : [];
  const answerMap = new Map();
  for (const answer of incoming) {
    if (!criterionIds.includes(answer.criterionId)) continue;
    answerMap.set(answer.criterionId, {
      response: ["yes", "no"].includes(answer.response) ? answer.response : null,
      comment: cleanText(answer.comment, 3000)
    });
  }
  if (!posterNumber || !judgeName) return res.status(400).json({ error: "Poster number and judge name are required." });
  if (requestedStatus === "submitted" && criterionIds.some((id) => !answerMap.get(id)?.response)) {
    return res.status(400).json({ error: "Please answer Yes or No for every criterion before submitting." });
  }

  const now = new Date().toISOString();
  submission.poster_number = posterNumber;
  submission.judge_name = judgeName;
  submission.status = requestedStatus;
  submission.updated_at = now;
  submission.submitted_at = requestedStatus === "submitted" ? now : null;
  submission.answers = criterionIds.map((criterionId) => {
    const answer = answerMap.get(criterionId) || { response: null, comment: "" };
    return { criterion_id: criterionId, response: answer.response, comment: answer.comment };
  });
  persistStore();
  res.json({ submission: publicSubmission(submission) });
});

app.get("/api/admin/submissions", requireAdmin, (_req, res) => {
  const submissions = [...store.submissions]
    .sort((a, b) => String(b.submitted_at || b.updated_at).localeCompare(String(a.submitted_at || a.updated_at)))
    .map(publicSubmission);
  res.json({ submissions });
});

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

app.get("/api/admin/export.csv", requireAdmin, (_req, res) => {
  const submissions = [...store.submissions].sort((a, b) =>
    a.poster_number.localeCompare(b.poster_number, undefined, { numeric: true, sensitivity: "base" }) ||
    a.judge_name.localeCompare(b.judge_name, undefined, { sensitivity: "base" })
  );
  const criterionText = new Map(rubric.flatMap((section) => section.criteria.map((criterion) => [criterion.id, criterion.text])));
  const header = ["Poster Number", "Judge Name", "Status", "Created At", "Submitted At", "Criterion ID", "Criterion", "Response", "Comment"];
  const lines = [header.map(csvCell).join(",")];
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      lines.push([submission.poster_number, submission.judge_name, submission.status, submission.created_at, submission.submitted_at, answer.criterion_id, criterionText.get(answer.criterion_id), answer.response, answer.comment].map(csvCell).join(","));
    }
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="biob90-poster-rubric-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\ufeff${lines.join("\r\n")}`);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong while saving the rubric." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`BIOB90 rubric listening on port ${port}; data file: ${dataPath}`);
  if (!adminPassword) console.warn("ADMIN_PASSWORD is not set. Organizer access is disabled.");
});

module.exports = app;
