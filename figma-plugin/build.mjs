import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

// Figma's plugin VM does not parse optional catch binding (`catch {`). esbuild may otherwise
// rewrite `catch (e)` → `catch {}` when it assumes ES2019+ support.
const figmaCompat = {
  target: "es2018",
  supported: { "optional-catch-binding": false },
};

await esbuild.build({
  entryPoints: [path.join(root, "src/ui.ts")],
  bundle: true,
  format: "iife",
  outfile: path.join(root, "dist/.ui-temp.js"),
  platform: "browser",
  ...figmaCompat,
});

const uiJs = fs.readFileSync(path.join(root, "dist/.ui-temp.js"), "utf8");
let html = fs.readFileSync(path.join(root, "src/ui.html"), "utf8");
html = html.replace('<script src="ui.js"></script>', `<script>\n${uiJs}\n</script>`);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/.ui-inline.html"), html);

const htmlLiteral = JSON.stringify(html);

await esbuild.build({
  entryPoints: [path.join(root, "src/code.ts")],
  bundle: true,
  outfile: path.join(root, "dist/code.js"),
  platform: "browser",
  ...figmaCompat,
  define: {
    __html__: htmlLiteral,
  },
});

fs.unlinkSync(path.join(root, "dist/.ui-temp.js"));
fs.unlinkSync(path.join(root, "dist/.ui-inline.html"));

const out = fs.readFileSync(path.join(root, "dist/code.js"), "utf8");
if (/\} catch \{/.test(out)) {
  console.error(
    "Build output still contains optional catch binding (`} catch {`). Figma will fail to parse it."
  );
  process.exit(1);
}

console.log("Built figma-plugin/dist/code.js");
