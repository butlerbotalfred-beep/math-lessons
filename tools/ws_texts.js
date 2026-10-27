// Prints every worksheet box's id and spoken texts for one lesson's world page, as JSON.
// usage (repo root): node tools/ws_texts.js p46 > /tmp/p46.json    (needs Playwright with Chromium)
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), pid = process.argv[2];
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage();
  await p.goto(`http://localhost:${srv.address().port}/${pid}/world.html`);
  await p.waitForFunction(() => window.WorldDebug, null, { timeout: 60000 });
  process.stdout.write(JSON.stringify(await p.evaluate(() => WorldDebug.sheetTexts()), null, 1) + "\n");
  await b.close(); srv.close();
});
