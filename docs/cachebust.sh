#!/bin/bash
# 给所有页面里的 whenscript.wasm / host.js 引用打上"内容哈希版本戳"(?v=<hash>)。
# 为什么:浏览器(尤其 Safari)对 .wasm 缓存极顽固,改了引擎后普通刷新还会跑旧 wasm。
# 用哈希当版本 → 内容没变时 URL 不变可缓存;内容一变 URL 就变、强制重新拉取。
# 幂等:重复跑只把旧 ?v= 换成新的。改完引擎(重建 wasm)后跑一次即可。
# 用法: bash website/cachebust.sh   (在任意目录都行)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
WV="$(cat "$DIR/whenscript.wasm" "$DIR/host.js" | shasum | cut -c1-10)"
# mask-demo.html 用时间戳自动 cache-bust,跳过,别覆盖它。
for f in "$DIR"/*.html; do
  case "$(basename "$f")" in mask-demo.html) continue;; esac
  grep -q 'whenscript.wasm\|host.js' "$f" || continue
  perl -i -pe 's{(\./whenscript\.wasm)(\?v=[0-9a-f]+)?}{$1."?v='"$WV"'"}ge; s{(\./host\.js)(\?v=[0-9a-f]+)?}{$1."?v='"$WV"'"}ge' "$f"
done
echo "cache-bust stamped: ?v=$WV  ($(ls "$DIR"/*.html | grep -v mask-demo | wc -l | tr -d ' ') pages)"
