#!/bin/bash
# 给所有页面里的 whenscript.wasm / host.js 引用打上"内容哈希版本戳"(?v=<hash>)。
# 为什么:浏览器(尤其 Safari)对 .wasm/.js 缓存极顽固,改了文件后普通刷新还跑旧的,no-cache 头也常被无视。
# 用【各自】内容哈希当版本 → 只有变了的那个文件 URL 变、强制重拉;另一个不变仍走缓存
#   (wasm 有 2.5MB,不能因为只改了 host.js 就连它一起重下)。
# 幂等:重复跑只把旧 ?v= 换成新的。改完引擎/host 后跑一次即可。
# 用法: bash website/cachebust.sh   (在任意目录都行)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
WASM_V="$(shasum "$DIR/whenscript.wasm" | cut -c1-10)"
HOST_V="$(shasum "$DIR/host.js" | cut -c1-10)"
# mask-demo.html 用时间戳自动 cache-bust,跳过,别覆盖它。
for f in "$DIR"/*.html; do
  case "$(basename "$f")" in mask-demo.html) continue;; esac
  grep -q 'whenscript.wasm\|host.js' "$f" || continue
  perl -i -pe 's{(\./whenscript\.wasm)(\?v=[0-9a-f]+)?}{$1."?v='"$WASM_V"'"}ge; s{(\./host\.js)(\?v=[0-9a-f]+)?}{$1."?v='"$HOST_V"'"}ge' "$f"
done
echo "cache-bust stamped: wasm ?v=$WASM_V  host ?v=$HOST_V  ($(ls "$DIR"/*.html | grep -v mask-demo | wc -l | tr -d ' ') pages)"
