// 零依赖静态服务器，用于本地预览 TIDELINE 的 web 构建
// 用法: node serve_web.js [TIDELINE_ROOT] [PORT]
const http = require("http"), fs = require("fs"), path = require("path");

function findRoot() {
  let d = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, "web", "index.html"))) return d;
    const p = path.dirname(d);
    if (p === d) break;
    d = p;
  }
  return null;
}

const root = process.argv[2] || findRoot();
const port = Number(process.argv[3] || 8137);
if (!root) { console.error("找不到 web 目录，请传入 TIDELINE 根目录参数。"); process.exit(2); }

const web = path.join(root, "web");
const ct = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".pck": "application/octet-stream"
};

http.createServer((q, s) => {
  let u = q.url.split("?")[0];
  if (u === "/") u = "/index.html";
  const fp = path.join(web, u);
  fs.readFile(fp, (e, d) => {
    if (e) { s.writeHead(404); s.end("404"); return; }
    s.writeHead(200, { "Content-Type": ct[path.extname(fp)] || "application/octet-stream" });
    s.end(d);
  });
}).listen(port, () => console.log("TIDELINE web 已启动: http://localhost:" + port + "/  (根: " + web + ")"));
