(function FormInput() {
  const correctInput = "WEWLAD";
  const PDAinput = document.querySelectorAll(".input-row input");
  const submitButton = document.getElementById("submitButton");
  const form = document.querySelector("form");

  // Add input listener to each field
  PDAinput.forEach(input => {
    input.addEventListener("input", FormChecker);
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // Show a loading indicator (optional)
    document.body.style.opacity = "0";
    document.body.style.transition = "opacity 0.3s ease";

    // Preload CSS to avoid FOUC
    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "style";
    preloadLink.href = "../CSS/sydieStyle.css"; 
    document.head.appendChild(preloadLink);

    try {
      const response = await fetch("./Syndicate.html");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const html = await response.text();

      // Parse the new HTML
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, "text/html");

      // Wait for fonts and CSS to fully load
      await Promise.all([
        document.fonts.ready,
        ...Array.from(newDoc.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => img.onload = resolve)),
      ]);

      // Replace the current document's content
      document.documentElement.innerHTML = newDoc.documentElement.innerHTML;

      // Scroll to top and fade in smoothly
      window.scrollTo(0, 0);
      document.body.style.opacity = "1";

      // Re-run scripts (if needed)
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        const newScript = document.createElement('script');
        newScript.textContent = script.textContent;
        if (script.src) newScript.src = script.src;
        script.replaceWith(newScript);
      });

    } catch (error) {
      console.error("Failed to load Syndicate.html:", error);
      document.body.style.opacity = "1"; // Ensure content is visible even if error occurs
    }
  });

  function FormChecker() {
    let isCorrect = true;
    for (let i = 0; i < correctInput.length; i++) {
      const inputVal = PDAinput[i].value.trim().toUpperCase();
      if (inputVal !== correctInput[i]) {
        isCorrect = false;
        break;
      }
    }

    // Toggle submit button based on input validity
    submitButton.style.display = isCorrect ? "inline-block" : "none";
  }

  // Initial check in case inputs are pre-filled
  FormChecker();
})();