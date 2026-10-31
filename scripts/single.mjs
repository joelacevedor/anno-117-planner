// Junta HTML, JS y CSS en un único archivo (vista previa compartible, sin modo offline).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = "dist-single";
let html = readFileSync(`${dir}/index.html`, "utf8");
const assets = readdirSync(`${dir}/assets`);
for (const f of assets.filter((f) => f.endsWith(".css")))
  html = html.replace(new RegExp(`<link rel="stylesheet"[^>]*${f}">`), () => `<style>${readFileSync(`${dir}/assets/${f}`, "utf8")}</style>`);
for (const f of assets.filter((f) => f.endsWith(".js"))) {
  const js = readFileSync(`${dir}/assets/${f}`, "utf8").replace(/<\/script/g, "<\\/script");
  html = html.replace(new RegExp(`<script type="module" crossorigin src="[^"]*${f}"></script>`), () => "");
  html = html.replace("</body>", () => `<script type="module">${js}</script></body>`);
}
html = html.replace(/<link rel="icon"[^>]*>/, "");
writeFileSync(`${dir}/anno117-cadenas.html`, html);
console.log("dist-single/anno117-cadenas.html", (html.length / 1024).toFixed(0), "KB");
