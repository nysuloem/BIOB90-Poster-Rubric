const state = { password: sessionStorage.getItem("biob90-admin-password") || "", rubric: null, submissions: [] };
const login = document.querySelector("#admin-login");
const dashboard = document.querySelector("#dashboard");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

async function request(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${state.password}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The dashboard could not be loaded.");
  return data;
}

function answerCount(submission, response) {
  return submission.answers.filter((answer) => answer.response === response).length;
}

function render() {
  const submitted = state.submissions.filter((item) => item.status === "submitted");
  const posterSet = new Set(submitted.map((item) => item.posterNumber.toLocaleLowerCase()));
  const average = submitted.length ? submitted.reduce((sum, item) => sum + answerCount(item, "yes"), 0) / submitted.length : null;
  document.querySelector("#submitted-count").textContent = submitted.length;
  document.querySelector("#poster-count").textContent = posterSet.size;
  document.querySelector("#average-score").textContent = average === null ? "—" : `${average.toFixed(1)} / 20`;

  const target = document.querySelector("#results-table");
  if (!state.submissions.length) {
    target.innerHTML = '<div class="empty-state">No judge reviews have been started yet.</div>';
    return;
  }
  target.innerHTML = `<table>
    <thead><tr><th>Poster</th><th>Judge</th><th>Status</th><th>Yes</th><th>Submitted</th><th></th></tr></thead>
    <tbody>${state.submissions.map((submission, index) => `
      <tr>
        <td><strong>${escapeHtml(submission.posterNumber)}</strong></td>
        <td>${escapeHtml(submission.judgeName)}</td>
        <td><span class="status-pill ${submission.status}">${submission.status}</span></td>
        <td>${answerCount(submission, "yes")} / 20</td>
        <td>${submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "—"}</td>
        <td><button class="small-button" data-toggle="${index}" type="button">Details</button></td>
      </tr>
      <tr class="details-row" data-details="${index}" hidden><td colspan="6"><div class="details-content">
        ${submission.answers.map((answer) => {
          const criterion = state.rubric.sections.flatMap((section) => section.criteria).find((item) => item.id === answer.criterionId);
          return `<div class="detail-answer"><strong>${criterion?.number || ""}. ${escapeHtml(answer.response ? answer.response.toUpperCase() : "UNANSWERED")}</strong> — ${escapeHtml(criterion?.text || answer.criterionId)}${answer.comment ? `<p>${escapeHtml(answer.comment)}</p>` : ""}</div>`;
        }).join("")}
      </div></td></tr>
    `).join("")}</tbody>
  </table>`;
  target.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", () => {
    const details = target.querySelector(`[data-details="${button.dataset.toggle}"]`);
    details.hidden = !details.hidden;
    button.textContent = details.hidden ? "Details" : "Close";
  }));
}

async function loadDashboard() {
  const [rubricResponse, data] = await Promise.all([fetch("/api/rubric").then((r) => r.json()), request("/api/admin/submissions")]);
  state.rubric = rubricResponse;
  state.submissions = data.submissions;
  login.hidden = true;
  dashboard.hidden = false;
  render();
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.password = document.querySelector("#admin-password").value;
  document.querySelector("#login-error").textContent = "";
  try {
    await loadDashboard();
    sessionStorage.setItem("biob90-admin-password", state.password);
  } catch (error) { document.querySelector("#login-error").textContent = error.message; }
});

document.querySelector("#logout-button").addEventListener("click", () => {
  sessionStorage.removeItem("biob90-admin-password");
  state.password = "";
  dashboard.hidden = true;
  login.hidden = false;
  document.querySelector("#admin-password").value = "";
});

document.querySelector("#export-button").addEventListener("click", async () => {
  const error = document.querySelector("#dashboard-error");
  error.textContent = "";
  try {
    const response = await fetch("/api/admin/export.csv", { headers: { Authorization: `Bearer ${state.password}` } });
    if (!response.ok) throw new Error("The export could not be created.");
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `biob90-poster-rubric-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) { error.textContent = err.message; }
});

if (state.password) loadDashboard().catch(() => sessionStorage.removeItem("biob90-admin-password"));
