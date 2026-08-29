const form = document.querySelector("#judge-lookup-form");
const message = document.querySelector("#judge-not-found");
const button = form.querySelector("button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.hidden = true;
  button.disabled = true;
  try {
    await fetch("/api/judges/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeName: document.querySelector("#judge-lookup-name").value })
    });
  } finally {
    message.hidden = false;
    button.disabled = false;
  }
});
