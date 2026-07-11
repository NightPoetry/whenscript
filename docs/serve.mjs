// 官网本地预览服务器(仅开发用;线上是 GitHub Pages 静态托管,不需要它)。
// 用法:node website/serve.mjs [端口]  → 默认 8765
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 8765);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".when": "text/plain; charset=utf-8",
  ".png": "image/png", ".json": "application/json", ".css": "text/css",
};

http.createServer((req, res) => {
  const f = decodeURIComponent(req.url.split("?")[0]);
  const rel = f === "/" ? "/index.html" : f;
  const fp = path.join(ROOT, path.normalize(rel));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }   // 防路径遍历
  try {
    const b = fs.readFileSync(fp);
    res.writeHead(200, { "content-type": MIME[path.extname(fp)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(b);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404: " + rel);
  }
}).listen(PORT, () => console.log(`WhenScript 官网预览 → http://localhost:${PORT}/`));
