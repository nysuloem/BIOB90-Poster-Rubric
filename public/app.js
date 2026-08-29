const DRAFT_KEY = "biob90-rubric-draft";
const state = { rubric: null, submission: null, token: null, saveTimer: null, saving: false, dirty: false };

const intro = document.querySelector("#intro");
const review = document.querySelector("#review");
const success = document.querySelector("#success");
const startForm = document.querySelector("#start-form");
const rubricForm = document.querySelector("#rubric-form");
const saveStatus = document.querySelector("#save-status");

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["X-Edit-Token"] = state.token;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

function draftReference() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

function setDraftReference(id, token) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, token }));
}

function clearDraftReference() {
  localStorage.removeItem(DRAFT_KEY);
}

function renderRubric() {
  rubricForm.innerHTML = state.rubric.sections.map((section) => `
    <section class="rubric-section" aria-labelledby="heading-${section.id}">
      <div class="section-heading">
        <span class="step-label">${section.criteria.length} criteria</span>
        <h2 id="heading-${section.id}">${section.title}</h2>
        <p>${section.description}</p>
      </div>
      ${section.criteria.map((criterion) => `
        <article class="criterion-card panel" data-criterion="${criterion.id}">
          <div>
            <span class="criterion-number">${criterion.number}</span>
            <p class="criterion-text">${criterion.text}</p>
          </div>
          <div class="answer-side">
            <fieldset class="choice-group" aria-label="Response for criterion ${criterion.number}">
              <label><input type="radio" name="${criterion.id}" value="yes"><span>Yes</span></label>
              <label><input type="radio" name="${criterion.id}" value="no"><span>No</span></label>
            </fieldset>
            <label class="comment-label">Comments
              <textarea data-comment="${criterion.id}" maxlength="3000" placeholder="Share specific, constructive feedback…"></textarea>
            </label>
          </div>
        </article>
      `).join("")}
    </section>
  `).join("");
  rubricForm.addEventListener("input", handleInput);
}

function applySubmission(submission) {
  state.submission = submission;
  document.querySelector("#current-poster").textContent = `Poster ${submission.posterNumber}`;
  document.querySelector("#current-judge").textContent = submission.judgeName;
  for (const answer of submission.answers) {
    if (answer.response) {
      const radio = rubricForm.querySelector(`input[name="${answer.criterionId}"][value="${answer.response}"]`);
      if (radio) radio.checked = true;
    }
    const textarea = rubricForm.querySelector(`[data-comment="${answer.criterionId}"]`);
    if (textarea) textarea.value = answer.comment || "";
  }
  updateProgress();
  intro.hidden = true;
  success.hidden = true;
  review.hidden = false;
  window.scrollTo({ top: 0 });
}

function collectAnswers() {
  return state.rubric.sections.flatMap((section) => section.criteria.map((criterion) => ({
    criterionId: criterion.id,
    response: rubricForm.querySelector(`input[name="${criterion.id}"]:checked`)?.value || null,
    comment: rubricForm.querySelector(`[data-comment="${criterion.id}"]`).value
  })));
}

function updateProgress() {
  const answers = collectAnswers();
  const completed = answers.filter((answer) => answer.response).length;
  const yes = answers.filter((answer) => answer.response === "yes").length;
  document.querySelector("#yes-score").textContent = yes;
  document.querySelector("#total-score").textContent = state.rubric.totalCriteria;
  document.querySelector("#progress-bar").style.width = `${(completed / state.rubric.totalCriteria) * 100}%`;
  document.querySelector("#submit-review").disabled = completed !== state.rubric.totalCriteria || state.saving;
  for (const card of rubricForm.querySelectorAll(".criterion-card")) card.classList.remove("unanswered");
}

function handleInput() {
  state.dirty = true;
  updateProgress();
  saveStatus.textContent = "Saving…";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveDraft(), 550);
}

async function saveDraft(status = "draft") {
  if (!state.submission) return;
  if (state.saving) {
    state.dirty = true;
    return;
  }
  state.saving = true;
  state.dirty = false;
  let saveSucceeded = false;
  updateProgress();
  try {
    const data = await api(`/api/submissions/${state.submission.id}`, {
      method: "PUT",
      body: JSON.stringify({
        posterNumber: state.submission.posterNumber,
        judgeName: state.submission.judgeName,
        answers: collectAnswers(),
        status
      })
    });
    state.submission = data.submission;
    saveSucceeded = true;
    saveStatus.textContent = status === "submitted" ? "Submitted" : "All changes saved";
    return data.submission;
  } catch (error) {
    state.dirty = true;
    saveStatus.textContent = "Could not save — check your connection";
    throw error;
  } finally {
    state.saving = false;
    updateProgress();
    if (state.dirty && status === "draft" && saveSucceeded) {
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(() => saveDraft(), 250);
    }
  }
}

startForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#intro-error");
  error.textContent = "";
  try {
    const data = await api("/api/submissions", {
      method: "POST",
      body: JSON.stringify({
        posterNumber: document.querySelector("#poster-number").value,
        judgeName: document.querySelector("#judge-name").value
      })
    });
    state.token = data.token;
    setDraftReference(data.id, data.token);
    applySubmission(data.submission);
  } catch (err) { error.textContent = err.message; }
});

document.querySelector("#resume-button").addEventListener("click", async () => {
  const ref = draftReference();
  if (!ref) return;
  state.token = ref.token;
  try {
    const data = await api(`/api/submissions/${ref.id}`);
    applySubmission(data.submission);
  } catch {
    clearDraftReference();
    document.querySelector("#resume-note").hidden = true;
  }
});

document.querySelector("#discard-button").addEventListener("click", () => {
  clearDraftReference();
  document.querySelector("#resume-note").hidden = true;
});

document.querySelector("#submit-review").addEventListener("click", async () => {
  const missing = collectAnswers().filter((answer) => !answer.response);
  const error = document.querySelector("#review-error");
  error.textContent = "";
  if (missing.length) {
    for (const answer of missing) rubricForm.querySelector(`[data-criterion="${answer.criterionId}"]`)?.classList.add("unanswered");
    error.textContent = `${missing.length} ${missing.length === 1 ? "criterion still needs" : "criteria still need"} a Yes or No response.`;
    rubricForm.querySelector(".criterion-card.unanswered")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  clearTimeout(state.saveTimer);
  try {
    await saveDraft("submitted");
    clearDraftReference();
    review.hidden = true;
    success.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) { error.textContent = err.message; }
});

document.querySelector("#another-review").addEventListener("click", () => {
  state.submission = null;
  state.token = null;
  startForm.reset();
  rubricForm.reset();
  success.hidden = true;
  intro.hidden = false;
  window.scrollTo({ top: 0 });
});

(async function init() {
  try {
    state.rubric = await api("/api/rubric");
    renderRubric();
    document.querySelector("#resume-note").hidden = !draftReference();
  } catch {
    document.querySelector("#intro-error").textContent = "The rubric could not be loaded. Please refresh the page.";
  }
})();
