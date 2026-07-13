#!/bin/bash
# 把一个 .when 页面预渲染成静态 HTML 外壳(SSR + 客户端水合),供 GitHub Pages 这类纯静态托管用。
#
# 用法: ./build-ssr.sh <name.when> <output.html> "<title>" "<meta description>"
#
# 原理:`whenscript ssr` 把 .when 程序跑一遍,吐出带 data-ws-h="N" 编号的静态 HTML 片段(创建序编号)。
# 这份片段直接塞进 <body>,首屏无需等 wasm 加载即可看到完整内容(SEO/社交预览友好)。随后客户端一样
# fetch 同一份 .when 源码、boot() 引擎——host.js 的水合探测(见 host_create 里的 hCounter 逻辑)按同样
# 的创建序"认领"这些既有节点而不是重新建,认领完后节点就活了(该反应式反应式,该点击点击)。
#
# ⚠️ 重要:这是一次性快照,不是构建流水线。改了对应 .when 的内容后,必须重跑这个脚本重新生成 html,
# 否则首屏快照(SSR 输出)和实际程序对不上——不严重(水合按序号认领,认领不上的会退化成客户端重建),
# 但会有一闪而过的"旧内容→新内容"跳变,肉眼可见,应当避免。
set -euo pipefail
WHEN="$1"; OUT="$2"; TITLE="$3"; DESC="$4"
DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$DIR/../Rust/target/release/whenscript"

if [ ! -x "$BIN" ]; then
  echo "找不到 whenscript 二进制($BIN)——先 cargo build --release --features web --manifest-path Rust/Cargo.toml" >&2
  exit 1
fi

FRAGMENT="$("$BIN" ssr "$DIR/$WHEN")"

{
  printf '%s\n' '<!doctype html>'
  printf '%s\n' '<html lang="zh-CN">'
  printf '%s\n' '<head>'
  printf '%s\n' '<meta charset="utf-8">'
  printf '%s\n' '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
  printf '<title>%s</title>\n' "$TITLE"
  printf '<meta name="description" content="%s">\n' "$DESC"
  printf '%s\n' '<link rel="icon" type="image/png" href="./icon.png">'
  printf '%s\n' '<style>'
  printf '%s\n' '  /* 首屏底色和 landing.when 的 token 一致,SSR 内容瞬间可见,不需要等 JS 就不会白屏闪烁。 */'
  printf '%s\n' '  html, body { margin: 0; padding: 0; }'
  printf '%s\n' '  body { background: #1e1b2e; color: #ece8f8; }'
  printf '%s\n' '  @keyframes ws-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,180,84,.5); } 50% { box-shadow: 0 0 0 6px rgba(255,180,84,0); } }'
  printf '%s\n' '</style>'
  printf '%s\n' '</head>'
  printf '%s\n' '<body>'
  printf '%s\n' "$FRAGMENT"
  printf '%s\n' '<script type="module">'
  printf '%s\n' '  // SSR 快照已经是完整首屏——这段只负责"接管"：fetch 同一份源码、boot() 引擎，'
  printf '%s\n' '  // host.js 认领既有 data-ws-h 节点使其变为活的反应式 DOM，不重新建页面、不闪烁。'
  printf '%s\n' '  import { boot } from "./host.js";'
  printf '%s\n' '  window.addEventListener("error", (e) => console.error("[hydrate]", (e && e.message) || e));'
  printf '%s\n' '  (async () => {'
  printf '    const res = await fetch("./%s");\n' "$WHEN"
  printf '%s\n' '    if (!res.ok) throw new Error("取不到源码(" + res.status + ")");'
  printf '%s\n' '    const source = await res.text();'
  printf '%s\n' '    await boot("./whenscript.wasm", source);'
  printf '%s\n' '  })().catch((e) => console.error("[hydrate]", e));'
  printf '%s\n' '</script>'
  printf '%s\n' '</body>'
  printf '%s\n' '</html>'
} > "$DIR/$OUT"

echo "built $OUT from $WHEN ($(wc -c < "$DIR/$OUT" | tr -d ' ') bytes)"
