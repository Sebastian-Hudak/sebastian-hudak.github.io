const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outputDir = path.join(root, "_site");

function bundleCss() {
  const entry = path.join(root, "assets/css/main.css");
  const target = path.join(outputDir, "assets/css/main.css");
  const seen = new Set();

  function readCss(file) {
    const absolute = path.resolve(file);
    if (seen.has(absolute)) return "";
    seen.add(absolute);

    const dir = path.dirname(absolute);
    const css = fs.readFileSync(absolute, "utf8");

    return css.replace(/@import\s+["']([^"']+)["'];/g, (_, importedPath) => {
      return readCss(path.join(dir, importedPath));
    });
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, readCss(entry));
}

function main() {
  if (fs.existsSync(path.join(outputDir, "assets/css/main.css"))) {
    bundleCss();
  }
}

main();
