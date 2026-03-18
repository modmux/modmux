const copyButtons = document.querySelectorAll(".copy-button");

for (const button of copyButtons) {
  button.addEventListener("click", async () => {
    const command = button.getAttribute("data-copy");
    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      const original = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1400);
    } catch {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1400);
    }
  });
}
