// Rewrites /privacy/ and /terms/ from the app's policies.
//
//   node tools/policies.mjs ../best-self-app
//
// The policies are written in the app's repo (legal/privacy-policy.md and
// legal/terms-of-service.md, the same text the app shows). After editing
// one there, run `npm run legal:sync` in its mobile/ folder for the app's
// own copy, then run this here and publish. Only the two policy pages are
// written; nothing else on the site is touched.
//
// Needs the app repo's installed packages (it borrows `marked` from
// mobile/node_modules), so run `npm install` there first if it's a fresh
// checkout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.resolve(process.argv[2] ?? path.join(site, "..", "best-self-app"));
const fail = (msg) => {
  console.error(`policies: ${msg}`);
  process.exit(1);
};
for (const f of ["legal/privacy-policy.md", "legal/terms-of-service.md", "mobile/brand.json"]) {
  if (!existsSync(path.join(app, f))) fail(`can't find ${f} in ${app}. Pass the app repo's folder: node tools/policies.mjs ../best-self-app`);
}
let marked;
try {
  ({ marked } = createRequire(path.join(app, "mobile", "package.json"))("marked"));
} catch {
  fail(`can't load "marked" from ${path.join(app, "mobile", "node_modules")}. Run npm install in ${path.join(app, "mobile")} first.`);
}

const brand = JSON.parse(readFileSync(path.join(app, "mobile/brand.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// The same fill-ins the app's own copy gets (mobile/scripts/sync-legal.mjs).
const read = (name) =>
  readFileSync(path.join(app, "legal", name), "utf8")
    .replace(/\r\n/g, "\n")
    .replaceAll("{{APP_NAME_UPPER}}", brand.appName.toUpperCase())
    .replaceAll("{{APP_NAME}}", brand.appName)
    .replaceAll("{{SUPPORT_EMAIL}}", brand.supportEmail || "[CONTACT EMAIL]");

// The page's furniture comes from the home page, so the policies always
// match it: the security policy, the body's settings and the footer.
const home = readFileSync(path.join(site, "index.html"), "utf8");
const take = (re, what) => (home.match(re) ?? fail(`index.html has no ${what}`))[0];
const csp = take(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "Content-Security-Policy");
const bodyOpen = take(/<body[^>]*>/, "<body>").replace('data-page="home"', 'data-page="policy"');
const footer = take(/<footer class="foot">[\s\S]*?<\/footer>/, "footer");
const mark = take(/<svg class="mark full"[\s\S]*?<\/svg>/, "footer mark");

function page(md, title, slug) {
  // The editor's note at the top is dropped and cross-links point at the pages.
  const body = marked.parse(md.replace(/^<!--[\s\S]*?-->\s*/, "").replaceAll("./privacy-policy.md", "/privacy/").replaceAll("./terms-of-service.md", "/terms/"), { gfm: true });
  const url = `https://gildstep.com/${slug}/`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(title)}.">
${csp}
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#0C0B09">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="${url}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/fonts/bricolage-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
<script src="/config.js" defer></script>
<script src="/site.js" defer></script>
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(brand.appName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(title)}.">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://gildstep.com/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(title)}.">
<meta name="twitter:image" content="https://gildstep.com/assets/og.png">
</head>
${bodyOpen}
<header class="wrap top"><a class="brand" href="/" aria-label="${esc(brand.appName)} home">${mark}<span>${esc(brand.appName)}</span></a></header>
<main class="wrap page">
${body}
</main>
${footer}
</body>
</html>
`;
}

const write = (slug, html) => {
  mkdirSync(path.join(site, slug), { recursive: true });
  writeFileSync(path.join(site, slug, "index.html"), html);
  console.log(`Wrote ${slug}/index.html`);
};
write("privacy", page(read("privacy-policy.md"), `${brand.appName} Privacy Policy`, "privacy"));
write("terms", page(read("terms-of-service.md"), `${brand.appName} Terms of Service`, "terms"));
