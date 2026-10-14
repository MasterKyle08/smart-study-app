// This response has a separate CSP: no network, imports, or child workers.
self.onmessage = (event) => {
  const code = event.data;
  if (typeof code !== "string" || code.length > 8000)
    return self.postMessage({ error: "Snippet exceeds the execution limit." });
  let output = "";
  const capture = (...values) => {
    if (output.length < 4000)
      output += values.map(String).join(" ").slice(0, 4000) + "\n";
  };
  try {
    const value = new Function("console", '"use strict";\n' + code)({
      log: capture,
      info: capture,
      warn: capture,
      error: capture,
    });
    self.postMessage({
      text:
        (output + (value === undefined ? "" : String(value))).slice(0, 4000) ||
        "undefined",
    });
  } catch (error) {
    self.postMessage({ error: String(error.message).slice(0, 500) });
  }
};
