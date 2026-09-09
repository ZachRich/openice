// The site works without this file: every filter is a plain GET form. This only
// removes the extra click, and wires the refresh button on /about.

const form = document.querySelector("form.search");
if (form) {
  for (const control of form.querySelectorAll("select, input[type=checkbox], input[type=date]")) {
    control.addEventListener("change", () => form.requestSubmit());
  }
}

const refresh = document.querySelector("#refresh");
if (refresh) {
  const label = refresh.querySelector("span");
  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    const original = label.textContent;
    label.textContent = "Checking rinks…";
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const result = await response.json();
      label.textContent = `${result.events ?? 0} sessions found`;
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      label.textContent = "Refresh failed";
      refresh.disabled = false;
      setTimeout(() => { label.textContent = original; }, 2500);
    }
  });
}
