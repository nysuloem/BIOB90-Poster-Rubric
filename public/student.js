const target = document.querySelector("#student-rubric");
const error = document.querySelector("#student-error");

function renderRubric(data) {
  target.innerHTML = data.sections.map((section) => `
    <section class="rubric-section" aria-labelledby="student-heading-${section.id}">
      <div class="section-heading">
        <span class="step-label">${section.criteria.length} criteria</span>
        <h2 id="student-heading-${section.id}">${section.title}</h2>
        <p>${section.description}</p>
      </div>
      <div class="student-criteria-list">
        ${section.criteria.map((criterion) => `
          <article class="panel student-criterion">
            <span class="criterion-number">${criterion.number}</span>
            <p class="criterion-text">${criterion.text}</p>
            <span class="yes-no-label" aria-label="Judged Yes or No">Yes / No</span>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");
}

fetch("/api/rubric")
  .then((response) => {
    if (!response.ok) throw new Error();
    return response.json();
  })
  .then(renderRubric)
  .catch(() => {
    target.innerHTML = "";
    error.textContent = "The rubric could not be loaded. Please refresh the page.";
  });
