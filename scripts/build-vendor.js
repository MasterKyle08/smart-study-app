const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(root, "public/vendor/pdfjs");
fs.mkdirSync(target, { recursive: true });
for (const file of ["pdf.mjs", "pdf.worker.mjs"])
  fs.copyFileSync(path.join(source, "build", file), path.join(target, file));
for (const directory of ["cmaps", "standard_fonts", "wasm"])
  fs.cpSync(path.join(source, directory), path.join(target, directory), {
    recursive: true,
  });
fs.copyFileSync(path.join(source, "LICENSE"), path.join(target, "LICENSE"));
const vendor = path.join(root, "public/vendor");
for (const [pkg, files] of [
  ["katex", ["dist/katex.min.js", "dist/katex.min.css", "dist/fonts"]],
  ["mammoth", ["mammoth.browser.min.js"]],
  ["tesseract.js", ["dist/tesseract.min.js", "dist/worker.min.js"]],
  [
    "tesseract.js-core",
    [
      "tesseract-core.wasm.js",
      "tesseract-core.wasm",
      "tesseract-core-simd.wasm.js",
      "tesseract-core-simd.wasm",
      "tesseract-core-lstm.wasm.js",
      "tesseract-core-lstm.wasm",
      "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm",
    ],
  ],
]) {
  const directory = path.dirname(require.resolve(pkg + "/package.json"));
  const destination = path.join(vendor, pkg);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) {
    const src = path.join(directory, file),
      dest = path.join(destination, path.basename(file));
    if (fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true });
  }
  for (const license of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    const file = path.join(directory, license);
    if (fs.existsSync(file))
      fs.copyFileSync(file, path.join(destination, license));
  }
}
console.log("Patched PDF reader assets prepared locally.");
