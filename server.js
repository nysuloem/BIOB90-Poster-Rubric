const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");
const { rubric, criterionIds } = require("./rubric");

const app = express();
const port = Number(process.env.PORT || 3000);
const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "rubric.sqlite");
const adminPassword = process.env.ADMIN_PASSWORD || "change-me";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    edit_token_hash TEXT NOT NULL,
    poster_number TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS answers (
    submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    criterion_id TEXT NOT NULL,
    response TEXT CHECK (response IN ('yes', 'no') OR response IS NULL),
    comment TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (submission_id, criterion_id)
  );

  CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
  CREATE INDEX IF NOT EXISTS idx_submissions_poster ON submissions(poster_number);
`);

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
  const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
  if (!submission) return null;
  const answers = db.prepare("SELECT criterion_id, response, comment FROM answers WHERE submission_id = ?").all(id);
  return { ...submission, answers };
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
  const insert = db.transaction(() => {
    db.prepare("INSERT INTO submissions (id, edit_token_hash, poster_number, judge_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, hash(token), posterNumber, judgeName, now, now);
    const statement = db.prepare("INSERT INTO answers (submission_id, criterion_id) VALUES (?, ?)");
    for (const criterionId of criterionIds) statement.run(id, criterionId);
  });
  insert();
  res.status(201).json({ id, token, submission: publicSubmission(getSubmission(id)) });
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
  const save = db.transaction(() => {
    db.prepare("UPDATE submissions SET poster_number = ?, judge_name = ?, status = ?, updated_at = ?, submitted_at = ? WHERE id = ?")
      .run(posterNumber, judgeName, requestedStatus, now, requestedStatus === "submitted" ? now : null, submission.id);
    const update = db.prepare("UPDATE answers SET response = ?, comment = ? WHERE submission_id = ? AND criterion_id = ?");
    for (const criterionId of criterionIds) {
      const answer = answerMap.get(criterionId) || { response: null, comment: "" };
      update.run(answer.response, answer.comment, submission.id, criterionId);
    }
  });
  save();
  res.json({ submission: publicSubmission(getSubmission(submission.id)) });
});

app.get("/api/admin/submissions", requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM submissions ORDER BY COALESCE(submitted_at, updated_at) DESC").all();
  res.json({ submissions: rows.map((row) => publicSubmission({ ...row, answers: db.prepare("SELECT criterion_id, response, comment FROM answers WHERE submission_id = ?").all(row.id) })) });
});

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

app.get("/api/admin/export.csv", requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT s.poster_number, s.judge_name, s.status, s.created_at, s.submitted_at,
           a.criterion_id, a.response, a.comment
    FROM submissions s JOIN answers a ON a.submission_id = s.id
    ORDER BY s.poster_number COLLATE NOCASE, s.judge_name COLLATE NOCASE, a.rowid
  `).all();
  const criterionText = new Map(rubric.flatMap((section) => section.criteria.map((criterion) => [criterion.id, criterion.text])));
  const header = ["Poster Number", "Judge Name", "Status", "Created At", "Submitted At", "Criterion ID", "Criterion", "Response", "Comment"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([row.poster_number, row.judge_name, row.status, row.created_at, row.submitted_at, row.criterion_id, criterionText.get(row.criterion_id), row.response, row.comment].map(csvCell).join(","));
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
  console.log(`BIOB90 rubric listening on port ${port}; database: ${dbPath}`);
  if (adminPassword === "change-me") console.warn("ADMIN_PASSWORD is not set. Set it before deploying.");
});

module.exports = app;
