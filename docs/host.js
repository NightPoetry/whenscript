// 真浏览器 DOM 宿主 —— 把 WhenScript wasm 内核的 host_* imports 实现成真 `document` API。
// 这是 M1 node-mock 的「真浏览器」对应版:同一条 host-import 接缝(无 wasm-bindgen),mock 换成真 DOM。
// 引擎一行不改。双向桥:host_* = 引擎→DOM(反应式写出);ws_fire = DOM→引擎(事件回灌)。
const X = {};                 // wasm exports(实例化后填入)
const els = { 0: null };      // 元素 id(host 分配,u32) → 真 DOM 节点;0 = null
let nextId = 1;
// 水合(hydration):若页面已含服务端渲染的 DOM(每个节点带 data-ws-h="创建序"),客户端跑同一程序、
// 同一 create 顺序 → 第 N 次 host_create 直接【认领】data-ws-h="N" 的现有节点(不新建),事件/反应式挂上去
// → 无重复 DOM。无 data-ws-h(普通 boot)则 hydrating=false,照旧新建。boot() 里初始化。
let hydrating = false, hCounter = 0;
const hMap = {};
const dec = (p, l) => new TextDecoder().decode(new Uint8Array(X.memory.buffer, p, l));
// W9:HTML 布尔属性——存在与否决定语义,不是字符串值(见 host_set_attr)。
const BOOL_ATTRS = new Set(["disabled", "checked", "readonly", "required", "selected", "multiple"]);
// 个人博客 demo:SVG 标签需要 createElementNS(否则 document.createElement 建出的 <svg>/<path> 落在 HTML
// 命名空间、浏览器当成未知元素、静默不渲染)。纯 host 侧(JS)绑定修复,dom.rs 的 `create(tag)` 通用原语不用改——
// 用户 .when 代码本来就能直接调用 create("svg")/create("path") 拼真实 SVG,零新语法。
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "svg", "path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "g",
  "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask",
  "text", "tspan", "use", "filter", "feGaussianBlur", "feColorMatrix", "feMerge",
  "feMergeNode", "feOffset", "feFlood", "feComposite", "marker", "symbol", "pattern",
]);

// host→引擎:DOM 事件 / 定时器到点 → 触发 WhenScript event(token = event.id),读回 print 输出。
const fire = (wsid) => { const o = rd(X.ws_fire(wsid)); if (o) console.log("[ws_fire]", o); };
// 值桥:带字符串载荷触发(输入框把 .value 喂进引擎)。把字符串写进 wasm 内存→ws_fire_str→读回→释放入参。
const fireStr = (wsid, s) => { const [p, l] = wr(s); const o = rd(X.ws_fire_str(wsid, p, l)); X.ws_free(p, l); if (o) console.log("[ws_fire_str]", o); };
// 富事件载荷值桥:带结构化 group 载荷触发。把 JSON 串过桥→ws_fire_json(引擎解析成 group)→读回→释放。
const fireJson = (wsid, s) => { const [p, l] = wr(s); const o = rd(X.ws_fire_json(wsid, p, l)); X.ws_free(p, l); if (o) console.log("[ws_fire_json]", o); };
// 把一个 DOM 事件的关键字段拼成扁平对象(坐标/滚轮/键码/修饰键 + 元素 value/checked),供 fireJson 序列化。
// 只提取【存在的】字段——mousemove 没有 key、keydown 没有 clientX;读不到的字段在 .when 侧是 unknown(不崩)。
// 修饰键归一成 0/1(WhenScript 无原生 bool 载荷习惯,数值好比较:`e.ctrlKey==1`)。
const EVT_NUM = ["clientX","clientY","offsetX","offsetY","pageX","pageY","button","buttons","deltaX","deltaY"];
const EVT_MOD = ["shiftKey","ctrlKey","altKey","metaKey"];
const eventPayload = (el, de) => {
  const o = { type: de.type };
  if (el.value !== undefined && el.value !== null) o.value = String(el.value);
  if (el.type === "checkbox" || el.type === "radio") o.checked = el.checked;
  for (const k of EVT_NUM) if (typeof de[k] === "number") o[k] = de[k];
  if (de.key !== undefined) o.key = de.key;
  if (de.code !== undefined) o.code = de.code;
  for (const k of EVT_MOD) if (de[k] !== undefined) o[k] = de[k] ? 1 : 0;
  return o;
};
// 感知信号值桥:把数值写进元素 backing group 的字段(width/height)→ 反应式跟随。写 field 串进内存→ws_write_field→读回(空)→释放。
const writeField = (elemId, field, value) => { const [p, l] = wr(field); rd(X.ws_write_field(elemId, p, l, value)); X.ws_free(p, l); };

// ── game2d 场景(host_game_* 的宿主侧)────────────────────────────────────────
// 保留模式:引擎只推精灵状态(place/size/spin/show/tile),宿主每帧按创建序重画。
// G = { canvas, ctx, images:{name→Image}, sprites:[{img,x,y,w,h,deg,visible,tile,tw,th,pat,patImg}], frameEvs:[eventId], t }
let G = null, gameRafOn = false;
const gameTick = (tms) => {
  if (!G) { gameRafOn = false; return; }
  requestAnimationFrame(gameTick);
  const t = tms / 1000;
  let dt = G.last === undefined ? 0 : t - G.last;
  G.last = t;
  if (dt > 0.05) dt = 0.05;              // 封顶:后台标签页切回时不产生一记巨大物理步长
  G.t += dt;
  // 先喂帧事件(引擎同步跑 when(frame) → place/spin 更新精灵状态),再画 → 同帧零滞后。
  for (const ev of G.frameEvs) fireJson(ev, JSON.stringify({ dt, t: G.t }));
  const { ctx, canvas } = G;
  ctx.imageSmoothingEnabled = false;     // 像素风:最近邻缩放,不糊
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of G.sprites) {
    if (!s.visible) continue;
    const img = G.images[s.img];
    if (!img || !img.complete || !img.naturalWidth) continue;   // 素材未加载完 → 本帧跳过(onload 后自然出现)
    const w = s.w || img.naturalWidth, h = s.h || img.naturalHeight;
    ctx.save();
    ctx.translate(s.x + w / 2, s.y + h / 2);                    // 移到精灵中心(spin 绕中心转)
    if (s.deg) ctx.rotate(s.deg * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);                              // 回到精灵左上角为原点
    if (s.tile) {
      // 平铺:把素材缩放进 tw×th 离屏块 → repeat pattern(锚定精灵左上角)填满 w×h(自动裁齐)。
      if (!s.pat || s.patImg !== img) {
        const off = document.createElement("canvas");
        off.width = s.tw; off.height = s.th;
        const octx = off.getContext("2d");
        octx.imageSmoothingEnabled = false;
        octx.drawImage(img, 0, 0, s.tw, s.th);
        s.pat = ctx.createPattern(off, "repeat");
        s.patImg = img;
      }
      ctx.fillStyle = s.pat;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.drawImage(img, 0, 0, w, h);
    }
    ctx.restore();
  }
};

// ── audio:Web Audio 实时合成音效(host_audio_play 的宿主侧)──────────────────
// 引擎只推一个音效【名字】过桥(零采样、零版权),宿主用 Web Audio 现场合成 → 神似但不复制任何原版采样。
// 懒创建【单个】AudioContext;每次播放前若 suspended 就 resume(浏览器要求音频必须在用户手势后才能响,
// 游戏第一次点击=开始=播 hmm 正好是那次手势)。AudioContext 不可用/被拦 → 静默跳过(库不 throw)。
let AC = null;                                   // null=未初始化,false=不可用(静默),否则=AudioContext
const audioCtx = () => {
  if (AC === null) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_e) { AC = false; }                   // 环境无 Web Audio → 永久静默
  }
  if (AC && AC.state === "suspended") { try { AC.resume(); } catch (_e) {} }  // 用户手势后解锁
  return AC || null;
};
// 一段【包络化】振荡器:type 波形、f0→f1 滑音(f1 省略=定频)、dur 时长秒、gain 峰值、
// filter 可选带通(模拟共振腔)、when 起始偏移秒(拼多段)。ADSR 极简:快起音 → 峰值 → 指数衰减到静音。
const blip = (ctx, o) => {
  const t0 = ctx.currentTime + (o.when || 0), dur = o.dur, gain = o.gain === undefined ? 0.2 : o.gain;
  const osc = ctx.createOscillator();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);             // 指数包络不能从/到 0,用极小值代替静音
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (o.filter) {                                // 带通:鼻腔/共振腔染色(hmm 的"嗯"靠它)
    const bq = ctx.createBiquadFilter();
    bq.type = o.filter.type || "bandpass";
    bq.frequency.value = o.filter.freq;
    if (o.filter.q !== undefined) bq.Q.value = o.filter.q;
    node.connect(bq); node = bq;
  }
  node.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
};
// 音效目录(名字 → 合成配方)。加新音效只改这里,引擎一行不动(和 game2d.image 不知道像素同理)。
const SOUNDS = {
  // hit:史蒂夫受击的"哦/呃"——方波 300→130Hz、150ms、快速衰减,闷闷低沉的一声
  hit:   (ctx) => blip(ctx, { type: "square", f0: 300, f1: 130, dur: 0.15, gain: 0.30 }),
  // hmm:村民"嗯~哼"——三角波过带通(鼻腔共振)分两段:第一段 190→210 平/微升,短停顿,第二段 210→150 降调
  hmm:   (ctx) => { blip(ctx, { type: "triangle", f0: 190, f1: 210, dur: 0.16, gain: 0.24, filter: { freq: 900, q: 6 } });
                    blip(ctx, { type: "triangle", f0: 210, f1: 150, dur: 0.22, gain: 0.24, filter: { freq: 800, q: 6 }, when: 0.22 }); },
  // score:清脆上扬的"叮"——正弦 800→1200Hz、80ms
  score: (ctx) => blip(ctx, { type: "sine", f0: 800, f1: 1200, dur: 0.08, gain: 0.18 }),
  // flap:短促拍打——三角波 520→380Hz、60ms、轻(每次点击都响,故意小声不喧宾夺主)
  flap:  (ctx) => blip(ctx, { type: "triangle", f0: 520, f1: 380, dur: 0.06, gain: 0.12 }),
};

const imports = { env: {
  // create(tag) → 新元素;先挂 body,被 append 到别处时浏览器自动移走 → 只有「根」留在 body。
  host_create: (tp, tl) => {
    const id = nextId++;
    const tag = dec(tp, tl);
    if (hydrating) {
      // 认领服务端第 hCounter 个节点(创建序对齐:客户端第 N 次 create ↔ 服务端 data-ws-h="N")。
      const existing = hMap[hCounter++];
      if (existing) { els[id] = existing; return id; }
      // 超出服务端集合(客户端动态多建的节点)→ 落到新建
    }
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    els[id] = el;
    document.body.appendChild(el);
    return id;
  },
  host_query: (sp, sl) => {
    const el = document.querySelector(dec(sp, sl));
    if (!el) return 0;
    const id = nextId++; els[id] = el; return id;
  },
  host_set_text:  (id, p, l)          => { if (els[id]) els[id].textContent = dec(p, l); },
  // "value" → 写「实时属性」node.value(非 attribute,attribute 只是默认值)且只在不同才写 → 不打断光标/输入法。
  // W9:HTML 布尔属性(disabled/checked/…)看的是**存在与否**,不是字符串值——`disabled="false"` 仍然是
  // disabled!字符串 "false"/空串 → 整个移除属性;否则 → 设成空字符串属性,`enabled: valid` 才能反应式生效。
  host_set_attr:  (id, n, nl, v, vl)  => { const e = els[id]; if (!e) return; const k = dec(n, nl), val = dec(v, vl);
                                           if (k === "value") { if (e.value !== val) e.value = val; }
                                           else if (BOOL_ATTRS.has(k)) { if (val === "false" || val === "") e.removeAttribute(k); else e.setAttribute(k, ""); }
                                           else e.setAttribute(k, val); },
  host_set_style: (id, p, pl, v, vl)  => { if (els[id]) els[id].style[dec(p, pl)] = dec(v, vl); },
  // 读/写数值属性 —— setStyle/setAttr 的读侧对称半边。读:scrollTop/scrollLeft/scrollHeight/offsetHeight/
  // offsetWidth/clientHeight/clientWidth/selectionStart/selectionEnd… (非数值/缺失 → 0)。写:同名可写属性。
  host_get_num:   (id, pp, pl)        => { const e = els[id]; if (!e) return 0; const v = e[dec(pp, pl)]; return typeof v === "number" ? v : 0; },
  host_set_num:   (id, pp, pl, v)     => { const e = els[id]; if (e) e[dec(pp, pl)] = v; },
  // preventKeys:列出的键在 keydown 时 preventDefault(Tab 插入两空格而非跳出文本框)。绑定的
  // on(el,"keydown",ev) 仍照常触发 —— 这里只阻止浏览器对这些键的默认行为。keys = JSON 字符串数组。
  host_prevent_keys: (id, kp, kl)     => { const e = els[id]; if (!e) return; let keys = []; try { keys = JSON.parse(dec(kp, kl)); } catch (_) {}
                                           const set = new Set(keys); e.addEventListener("keydown", (de) => { if (set.has(de.key)) de.preventDefault(); }); },
  host_append:    (par, ch)           => { if (els[par] && els[ch]) els[par].appendChild(els[ch]); },
  host_remove:    (id)                => { if (els[id]) els[id].remove(); },   // reconcile 卸载子元素
  // 事件回灌:输入类元素(有 .value)走值桥 fireStr 带文本;其余(按钮/卡片点击)走无载荷 fire。
  // W9:checkbox 的 .value 恒为静态 attribute(不随勾选变),真正的勾选态在 .checked——特判发 "true"/"false"。
  // P4:把一个 HTML 容器(Box 等,非 SVG)光栅化成 mask-image —— "任何容器都能当蒙版"(语言领跑,平台兑现)。
  // 返回 1 = 已处理(源是 HTML);0 = 源是 SVG 绘制 → 让 Rust 走 <mask> 路。WhenScript 的样式是行内设置的
  // (setStyle 写 element.style),所以 outerHTML 自带全部样式,序列化自包含(无需额外内联计算样式)。
  // 诚实边界:这是【栅格快照】——外部字体/图片需自行内嵌成 data-URI 才会出现在蒙版里;每次反应式变化重栅格。
  host_html_mask: (targetId, sourceId, lum) => {
    const src = els[sourceId], tgt = els[targetId];
    if (!src || !tgt) return 0;
    if (src.namespaceURI === SVG_NS) return 0;      // SVG 源 → 交给 Rust 的 <mask> 路
    // 量尺寸(移出可视流前);把源移进一个屏外 HTML 暂存区(保留尺寸、不在页面里显示)。
    let holder = document.getElementById("ws-mask-html");
    if (!holder) { holder = document.createElement("div"); holder.id = "ws-mask-html";
      holder.style.cssText = "position:absolute;left:-99999px;top:0;pointer-events:none"; document.body.appendChild(holder); }
    if (src.parentNode !== holder) holder.appendChild(src);
    const w = Math.max(1, src.offsetWidth), h = Math.max(1, src.offsetHeight);
    const clone = src.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const html = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
    const uri = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
    const mode = lum ? "luminance" : "alpha";
    for (const [p, v] of [["maskImage", uri], ["webkitMaskImage", uri], ["maskMode", mode], ["webkitMaskMode", mode],
                          ["maskRepeat", "no-repeat"], ["webkitMaskRepeat", "no-repeat"],
                          ["maskSize", w + "px " + h + "px"], ["webkitMaskSize", w + "px " + h + "px"],
                          ["maskComposite", "add"], ["webkitMaskComposite", "source-over"]]) tgt.style[p] = v;
    return 1;
  },
  // wantsGroup(第5参)由引擎按事件声明类型决定:event<group>→1(发结构化 group)、event<string>→0(发 .value 字符串)。
  // 类型即契约:用户声明 event<group> 就拿富载荷(坐标/键码/…),声明 event<string> 就拿文本(不变)。
  host_on:        (id, ep, el, wsid, wantsGroup)  => { const e = els[id]; if (!e) return; const ev = dec(ep, el);
                                           e.addEventListener(ev, (de) => {
                                             if (wantsGroup) { fireJson(wsid, JSON.stringify(eventPayload(e, de))); return; }
                                             if (e.type === "checkbox") { fireStr(wsid, String(e.checked)); return; }
                                             const v = e.value;
                                             if (v !== undefined && v !== null) fireStr(wsid, String(v)); else fire(wsid); }); },
  host_focus:     (id)                => { const e = els[id]; if (e && e.focus) e.focus(); },   // a11y/键盘焦点
  // Web Animations API:element.animate(keyframes, options)。任意关键帧+完整时序/缓动(含 spring 式
  // linear()/cubic-bezier);delay 做错峰/时间线编排。keyframes/options 都是引擎序列化过来的 JSON。
  host_animate:   (id, kp, kl, op, ol) => { const e = els[id]; if (!e || !e.animate) return;
                                            try { e.animate(JSON.parse(dec(kp, kl)), ol > 0 ? JSON.parse(dec(op, ol)) : {}); } catch (_e) {} },
  host_set_timeout: (ms, tok)         => setTimeout(() => fire(tok), ms),
  // 感知信号:引擎注册元素后,host 对它设 ResizeObserver,尺寸变 → 把 width/height/overflowed 推回引擎(反应式
  // 跟随)。W10:overflowed = 内容是否溢出自己的盒子(scrollWidth/Height > clientWidth/Height),同一条
  // writeField(=ws_write_field)通路,零新机制——`when(self.overflowed==1){…}` 才有得写。
  host_observe:    (id)               => {
    const e = els[id]; if (!e || typeof ResizeObserver === "undefined") return;
    if (e._wsRo) return;                              // 已观察 → 不重复
    e._wsRo = new ResizeObserver(() => {
      // rAF 合并 + 延迟:把"尺寸变 → 推回引擎 → 反应式改布局"挪到下一帧执行,不在 ResizeObserver
      // 回调的同步栈里改 DOM——否则同步改布局会立刻触发下一轮观察,浏览器一帧没派发完就报
      // "ResizeObserver loop completed with undelivered notifications"(良性但很吵)。挪到 rAF 后循环被打破。
      if (e._wsRaf) return;                            // 一帧内多次 resize 通知合并成一次
      e._wsRaf = requestAnimationFrame(() => {
        e._wsRaf = 0;
        const r = e.getBoundingClientRect();           // rAF 里读元素最新 border-box 尺寸(不用可能已过期的 entry)
        const w = Math.round(r.width), h = Math.round(r.height);
        if (w !== e._wsW) { e._wsW = w; writeField(id, "width", w); }
        if (h !== e._wsH) { e._wsH = h; writeField(id, "height", h); }
        const ov = (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight) ? 1 : 0;
        if (ov !== e._wsOv) { e._wsOv = ov; writeField(id, "overflowed", ov); }
      });
    });
    e._wsRo.observe(e);
  },
  // 全局窗口感知:host_observe_window 注册 window.resize → 把 innerWidth/innerHeight 推进 win 的 backing group。
  // 初始先推一次,免得 width/height 停在 0 等首次 resize。复用 writeField(=ws_write_field)路径,elem_id 用哨兵 WINDOW_ID。
  host_observe_window: (wsid)         => {
    const push = () => { writeField(wsid, "width", window.innerWidth); writeField(wsid, "height", window.innerHeight); };
    window.addEventListener("resize", push);
    setTimeout(push, 0);   // 初始测量延后到 boot 之后:boot 期间 ENGINE 被取出,重入 ws_write_field 是 no-op
  },
  // SPA 路由:host_on_popstate 注册 window.popstate → 回退/前进时把新路径(pathname)喂进 route 事件;
  // host_pushstate 引擎主动导航(改 URL 不重载)。pushState 自身不触发 popstate,故引擎侧再 emit route。
  host_on_popstate: (wsid)           => { window.addEventListener("popstate", () => fireStr(wsid, location.pathname)); },
  host_pushstate:   (p, l)           => { history.pushState({}, "", dec(p, l)); },
  // net.fetch:异步 HTTP 客户端。host 发请求,完成时把响应 group{status,ok,body,url} 经 fireJson 回灌
  // 绑定的 event<group>(复用 v123 富事件载荷通路)。opts(JSON)带 method/body/headers 支持非 GET;网络失败
  // 也回灌一个 {status:0,ok:0,error} 事件(不静默吞)。fetch 天生 async,不阻塞主线程。
  host_fetch: (up, ul, evid, op, ol) => {
    const url = dec(up, ul);
    let init = {};
    if (ol > 0) { try { const o = JSON.parse(dec(op, ol));
      if (o.method) init.method = o.method;
      if (o.body !== undefined) init.body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
      if (o.headers) init.headers = o.headers;
    } catch (_e) {} }
    fetch(url, init)
      .then(r => r.text().then(body => fireJson(evid, JSON.stringify({ status: r.status, ok: r.ok ? 1 : 0, body, url: r.url }))))
      .catch(err => fireJson(evid, JSON.stringify({ status: 0, ok: 0, body: "", url, error: String((err && err.message) || err) })));
  },
  // storage:同步 localStorage。get 走 host→wasm 字符串回传(packStr:alloc [u32 len][bytes] 返回指针,
  // Rust 读后 ws_free)——键不存在返回 0 → 引擎侧 unknown(诚实缺值,和存了 "" 区分)。
  host_storage_get:    (kp, kl)         => { const v = localStorage.getItem(dec(kp, kl)); return v === null ? 0 : packStr(v); },
  host_storage_set:    (kp, kl, vp, vl) => { localStorage.setItem(dec(kp, kl), dec(vp, vl)); },
  host_storage_remove: (kp, kl)         => { localStorage.removeItem(dec(kp, kl)); },
  // 读 URL 查询参数(location.search):同 host_storage_get 的字符串回传约定;缺失 → 0 → 引擎侧 "" 。
  host_url_param:      (np, nl)         => { const v = new URLSearchParams(location.search).get(dec(np, nl)); return v === null ? 0 : packStr(v); },
  // ── game2d:保留模式 canvas 精灵 + rAF 帧时钟(实现见上方 gameTick)──────────
  // stage(w,h):建像素风 canvas,登进【同一张 els 元素表】→ dom 的 on/append/setStyle 直接可用(零新输入机制);
  // 同时初始化场景 + 启动 rAF 循环。重复调用 = 重置场景(重跑程序不叠加旧精灵)。
  host_game_stage: (w, h) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.style.imageRendering = "pixelated";   // 像素风:CSS 放大也不糊
    canvas.style.display = "block";
    const id = nextId++;
    els[id] = canvas;
    document.body.appendChild(canvas);           // 同 host_create:先挂 body,被 append 到别处时自动移走
    G = { canvas, ctx: canvas.getContext("2d"), images: {}, sprites: [], frameEvs: [], t: 0, last: undefined };
    if (!gameRafOn) { gameRafOn = true; requestAnimationFrame(gameTick); }
    return id;
  },
  // image(name,url):登记素材并预加载。绘制对未加载完的素材静默跳过(onload 后自然出现),不报错。
  host_game_image: (np, nl, up, ul) => {
    if (!G) return;
    const img = new Image();
    img.src = dec(up, ul);
    G.images[dec(np, nl)] = img;
  },
  // sprite(imgName) → 精灵 id(独立命名空间 = 场景数组下标+1;0 保留作"无效")。绘制顺序 = 创建顺序。
  host_game_sprite: (np, nl) => {
    if (!G) return 0;
    G.sprites.push({ img: dec(np, nl), x: 0, y: 0, w: 0, h: 0, deg: 0, visible: 1, tile: false, tw: 0, th: 0, pat: null, patImg: null });
    return G.sprites.length;                     // id 从 1 起
  },
  host_game_place: (sid, sx, sy)  => { const s = G && G.sprites[sid - 1]; if (s) { s.x = sx; s.y = sy; } },
  host_game_size:  (sid, w, h)    => { const s = G && G.sprites[sid - 1]; if (s) { s.w = w; s.h = h; } },
  host_game_spin:  (sid, deg)     => { const s = G && G.sprites[sid - 1]; if (s) s.deg = deg; },
  host_game_show:  (sid, vis)     => { const s = G && G.sprites[sid - 1]; if (s) s.visible = vis; },
  host_game_tile:  (sid, tw, th)  => { const s = G && G.sprites[sid - 1]; if (s) { s.tile = true; s.tw = tw; s.th = th; s.pat = null; } },
  // frames(event):登记帧事件源 —— 每帧经 fireJson 回灌 event<group> 载荷 {dt, t}(游戏时钟,取代 delay 链)。
  host_game_frames: (evid)        => { if (G) G.frameEvs.push(evid); },
  // ── audio:sound(name) → 现场合成播放(实现见上方 SOUNDS/blip)────────────
  // 未知名 → console.warn(不静默、不 throw);AudioContext 不可用或合成异常 → 静默跳过(库不炸)。
  host_audio_play: (np, nl) => {
    const name = dec(np, nl);
    const make = SOUNDS[name];
    if (!make) { console.warn("[audio] 未知音效:" + name); return; }
    const ctx = audioCtx();
    if (!ctx) return;                            // 无 Web Audio → 静默跳过
    try { make(ctx); } catch (_e) {}             // 合成失败也不炸
  },
}};

const mem = () => X.memory.buffer;
const wr = (s) => { const e = new TextEncoder().encode(s); const p = X.ws_alloc(e.length); new Uint8Array(mem(), p, e.length).set(e); return [p, e.length]; };
const rd = (r) => { const n = new DataView(mem()).getUint32(r, true); const s = new TextDecoder().decode(new Uint8Array(mem(), r + 4, n)); X.ws_free(r, 4 + n); return s; };
// host→wasm 字符串回传:alloc [u32 LE len][bytes],返回指针;Rust 侧读长度+字节后 ws_free(ptr, 4+len)。
// 和 rd 对称(rd 是引擎→host 读,packStr 是 host→引擎写),storage.get 用它把 localStorage 值交回引擎。
const packStr = (s) => { const e = new TextEncoder().encode(s); const p = X.ws_alloc(4 + e.length); const dv = new DataView(mem()); dv.setUint32(p, e.length, true); new Uint8Array(mem(), p + 4, e.length).set(e); return p; };

// ★框架基线样式表 `ws-base`★ —— 一处权威、强力全量框定浏览器的 UA 惊喜默认值,让所有容器从一块干净、
// 可预期的地基上"自由发挥"。用样式表(而非逐元素行内 setStyle)是刻意的:样式表优先级 LOW 于用户在
// 块里写的行内配置 → 用户写什么都稳稳盖过基线(基线只是"地板"),而且覆盖到手写 create() 出的元素。
// 这一张表取代了原先散在各叶子工厂里的零散默认(Image/Button/表单控件/textarea 的 setStyle 都收进来)。
function injectBaseStyles() {
  if (document.getElementById("ws-base")) return; // 幂等
  const style = document.createElement("style");
  style.id = "ws-base";
  style.textContent = `
    /* 盒模型:一律 border-box —— width/height 是最终尺寸,和 padding/border 不打架 */
    *, *::before, *::after { box-sizing: border-box; }
    /* 清掉一切默认外边距(body 8px、标题/段落的 UA margin 等)—— 间距一律由 .when 显式表达 */
    * { margin: 0; }
    body { line-height: 1.5; -webkit-font-smoothing: antialiased; }
    /* 媒体元素:块级(去掉行内基线缝隙)+ 装得住容器(max-width:100% 不溢出) */
    img, picture, video, canvas { display: block; max-width: 100%; }
    svg { max-width: 100%; }          /* 不强制 block:svg 作 flex 子项时 block 会被按内容量塌,保留默认 display */
    /* 表单控件:继承页面字体(UA 否则用自带小字体)、textarea 只竖向缩放(默认 both 能被拖出容器) */
    input, button, textarea, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
    textarea { resize: vertical; }
    /* ★默认动态★:反应式的值一变,CSS 把变化补成平滑过渡(而不是硬跳)——于是 when 里"值 := 什么"天然
       带动画:主题切换渐变、状态色渐变、位置移动(自定义布局如瀑布流)都自动顺滑。只精选【外观 + 位置】,
       故意不含 width/height(布局宽高动画容易卡顿、且 resize 时误动);想要别的过渡在元素上自己写会叠加。
       首帧不触发(值在首次绘制前就设好了),所以只有【交互/异步测量之后】的变化才动——不会满屏乱飞入场。*/
    * { transition: background-color .25s ease, color .25s ease, border-color .25s ease, fill .25s ease,
                    box-shadow .2s ease, opacity .2s ease, transform .2s ease, top .3s ease, left .3s ease; }
    /* 链接:继承颜色、去下划线(交给 .when 决定视觉) */
    a { color: inherit; text-decoration: none; }
    ul, ol { list-style: none; }
    /* 长词/长串不撑破容器(装得住) */
    p, h1, h2, h3, h4, h5, h6, span, div { overflow-wrap: break-word; }
    /* W7 动效 keyframes(纯 CSS 合成器跑,引擎零参与) */
    @property --ws-a { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
    @keyframes ws-spin     { to { --ws-a: 360deg; } }
    @keyframes ws-spin-box { to { transform: rotate(360deg); } }
    @keyframes ws-sweep { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @keyframes ws-pulse { 50% { opacity: .55; } }
  `;
  document.head.appendChild(style);
}

// 加载 wasm、绑定 host imports、boot 一段 WhenScript 程序(顶层 create/when/:=/changed/on/delay 全跑)。
export async function boot(wasmUrl, source) {
  injectBaseStyles();
  // 水合探测:页面里已有服务端渲染节点(带 data-ws-h)→ 进水合模式,建"创建序→节点"表供 host_create 认领。
  const hNodes = document.querySelectorAll("[data-ws-h]");
  if (hNodes.length > 0) {
    hydrating = true;
    hCounter = 0;
    hNodes.forEach((e) => { hMap[+e.getAttribute("data-ws-h")] = e; });
  }
  let instance;
  try {
    ({ instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), imports));
  } catch (_e) {                                   // MIME 不是 application/wasm 时回退
    ({ instance } = await WebAssembly.instantiate(await (await fetch(wasmUrl)).arrayBuffer(), imports));
  }
  Object.assign(X, instance.exports);
  const [p, l] = wr(source);
  const out = rd(X.ws_boot(p, l));
  X.ws_free(p, l);
  console.log("[boot]", out);
  // 窗口特效:若程序建了 #bg,让它相对显示器固定(每帧读窗口位置、反向抵消)。
  // ⚠ 这段“感知窗口位置”现在由 host(JS)做 —— 当前 wasm 桥还不能把数值喂进引擎;
  //    底层 API(measure/place + window.x 感知信号)加上后,会变成 .when 里的反应式 `x := -window.x`。
  const __bg = document.querySelector("#bg");
  if (__bg) {
    __bg.style.willChange = "transform";            // 提升为 GPU 合成层 → 移动只合成、不重排/重绘
    let __lx = null, __ly = null;
    const tick = () => {
      const x = window.screenX, y = window.screenY;
      if (x !== __lx || y !== __ly) {               // 位置没变就不写 style,省掉无谓重绘
        __bg.style.transform = "translate3d(" + (-x) + "px," + (-y) + "px,0)";  // 3d → 走 GPU
        __lx = x; __ly = y;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
  return out;
}
