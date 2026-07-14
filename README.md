# WhenScript

**写入,即触发。** WhenScript 是一门事件驱动的强类型反应式脚本语言:没有轮询、没有手动订阅、没有虚拟 DOM——值一变,依赖它的一切自己动,像电流过电路。为人类与 AI 而生。

*WhenScript is an event-driven, strongly-typed reactive scripting language: every write triggers evaluation, everything is an event. Built for humans and AI.*

```when
number count  = 0;
number double := count * 2;      // 派生:自动跟着变

when(add) { count = count + 1; } // 写入,即触发

changed(count) {
  setText(label, "${count} / ${double}");
}
```

## 三十秒上手

- **官网与在线 Playground**(不装任何东西,浏览器里改一个值看界面自己动):https://nightpoetry.github.io/whenscript/
- **VS Code 扩展**(高亮/诊断/悬停文档/补全/片段):
  ```
  code --install-extension whenscript-lang.whenscript
  ```
  或在 [Marketplace](https://marketplace.visualstudio.com/items?itemName=whenscript-lang.whenscript) 搜 "WhenScript"。

## 语言一瞥

- **一切皆事件**:赋值、点击、定时器到点都是事件;`event<T>` 是一等值,可传递、可跨模块共享委托。
- **组合逻辑电路模型**:`:=` 持续绑定像门电路接线;每次写入先让派生值收敛到不动点再触发 `when`(glitch-free)。
- **透明并发**:写码像单线程,引擎自动并行执行读写集不冲突的反应,结果与串行一致。
- **强类型 + 类型转换格**:计算「升-算-降」不打扰,赋值是唯一强制点;`number<string>:2` 定点小数。
- **实体与确定性回收**:`group` 圈定作用域,离开即回收,无 GC 暂停。
- **工具链**:`check` / `fmt` / LSP / REPL / `pkg`(去中心化包管理)/ `graph`(运行时依赖图)。

镇站之宝:[Flappy 金苹果](https://nightpoetry.github.io/whenscript/playground.html?example=game.when)——一个完整的小游戏,7 个状态变量 + 5 条扁平 `when`,碰撞检测和计分全是 `when` 条件,没有游戏循环对象。

## 本仓库结构

```
docs/     官网源码(GitHub Pages 托管;含 Playground 与 wasm 引擎)
editor/   VS Code 扩展源码
```

语言引擎(Rust 实现)暂未在此仓库开源,后续规划中。

## 反馈

- 提 [Issue](https://github.com/NightPoetry/whenscript/issues)
- Marketplace [Q&A](https://marketplace.visualstudio.com/items?itemName=whenscript-lang.whenscript&ssr=false#qna)
- 官网[联系页](https://nightpoetry.github.io/whenscript/contact.html)

## License

[MIT License Plus (Attribution Required; Patent Defense)](./LICENSE) © 2026 NightPoetry and WhenScript contributors
