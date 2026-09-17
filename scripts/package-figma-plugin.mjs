import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(root, "figma-plugin");
const manifestPath = path.join(pluginDir, "manifest.json");
const codePath = path.join(pluginDir, "dist", "code.js");
const outZip = path.join(root, "public", "designteam-figma-plugin.zip");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["run", "build"], { cwd: pluginDir, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);

if (!fs.existsSync(codePath)) {
  console.error("Missing figma-plugin/dist/code.js after build");
  process.exit(1);
}

const zip = new JSZip();
zip.file("manifest.json", fs.readFileSync(manifestPath));
zip.file("dist/code.js", fs.readFileSync(codePath));

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(path.dirname(outZip), { recursive: true });
fs.writeFileSync(outZip, buf);
console.log("Wrote", path.relative(root, outZip));
