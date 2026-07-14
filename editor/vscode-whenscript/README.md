<p align="center"><img src="icon.png" width="96" height="96" alt="WhenScript 图标"></p>

# WhenScript for VS Code

> 反应式 when 语言:写入即触发、心智负担小,为人类和 AI 而生。

给 WhenScript（后缀 `.when` 的事件驱动、强类型、反应式脚本语言,本仓库根目录即其规范实现）提供 VS Code 支持:语法高亮、代码片段、括号/缩进配置,以及(可选)接一个真的语言服务器拿诊断。

## 这是什么

WhenScript 的核心哲学是"写入即触发求值,一切皆事件":`when(cond){}` 反应式条件、`event`/`emit` 命名事件、`group` 反应式实体、`:=` 持续绑定等。这个扩展让你在编辑器里写 `.when` 文件时:

- 关键字、字符串插值 `${}`、数字(含 `0x`/`0b`/科学计数法)、`:=` 反应式绑定、`number<string>` 精炼类型、`event<group>` 事件类型、前端容器(`Box`/`Row`/`Column`/... PascalCase)等都有区分度高的高亮。
- 打 `when`/`changed`/`event`/`emit`/`group`/`function`/`import` 等能出片段,占位符补全常见样板。
- 花括号自动闭合、`{` 后自动缩进、`}` 自动回退缩进。
- (可选)如果你本地构建了 `whenscript` 二进制,扩展会用它跑一个语言服务器,给你实时诊断(语法错误 / 语义错误)。**没构建也完全能用**——语法高亮和代码片段不依赖 LSP,只是没有诊断而已,不会报错、不会崩溃,只会弹一次提示条。

## 装法(开发期)

这个扩展还没发布到 Marketplace,目前是仓库自带的开发期扩展。两种跑法:

### 方式一:软链接到 VS Code 扩展目录(推荐,改了立刻生效)

```bash
cd editor/vscode-whenscript
npm install                                    # 只装一次,装 vscode-languageclient
ln -s "$(pwd)" ~/.vscode/extensions/whenscript-lang.whenscript-0.2.0
```

然后重启 VS Code(或命令面板 "Developer: Reload Window")。改这个目录下的文件后,重新加载窗口即可看到效果(TextMate 语法/snippets 改动有时甚至不用重启,重开一下 `.when` 文件就够)。

Windows 上换成 VS Code 扩展目录 `%USERPROFILE%\.vscode\extensions\`,不支持符号链接就直接把整个目录拷贝过去(拷贝版没法"改了立刻生效",改完要重新拷贝)。

### 方式二:装现成的 .vsix(最省事)

本目录已经打好一个 `whenscript-0.2.0.vsix`(2026-07-11,含全部依赖):

```bash
code --install-extension editor/vscode-whenscript/whenscript-0.2.0.vsix
```

改过扩展代码后要重新打包:

```bash
cd editor/vscode-whenscript
npm install
npx @vscode/vsce package --allow-missing-repository   # 重新生成 .vsix
```

这种方式装完是"快照",扩展代码再改不会自动生效,需要重新 package + install。适合分享给别人试用,不适合你自己边改边看效果。

## LSP 二进制怎么构建(可选,给诊断用)

语法高亮不需要这一步。想要"写错了立刻标红"的诊断能力,才需要构建规范实现(Rust)的 `whenscript` 二进制,并让它跑 `lsp` 子命令:

```bash
cargo build --release --manifest-path Rust/Cargo.toml --features web
# 二进制在 Rust/target/release/whenscript
```

> **`--features web` 别省**:前端语法(container / 统一块 / 二维版图)只在 web 特性下编译进 parser。用默认构建跑 LSP,打开前端 `.when` 文件会**误报解析错误**(实测:默认构建 check 80 个 demo 误报 23 个前端文件,web 构建全部正常)。纯服务端项目用默认构建也行,但既然是编辑器全场景,直接带上 web。

然后在 VS Code 设置里把 `whenscript.lspPath` 指到这个路径,例如(`settings.json`):

```json
{
  "whenscript.lspPath": "/绝对路径/WhenScript_opus/Rust/target/release/whenscript"
}
```

如果 `whenscript.lspPath` 指向的二进制不存在、不可执行,或者根本没设置(默认值 `"whenscript"`,指望它在 `PATH` 里),扩展会弹一条提示:"语法高亮仍可用,诊断需构建 whenscript 二进制",然后继续正常工作——不会因此报错或罢工。

## 功能清单

- **语言注册**:`.when` 文件识别为 `whenscript` 语言(`language-configuration.json`:注释符 `//` `/* */`、括号对、自动闭合双引号、缩进规则)。
- **语法高亮**(`syntaxes/whenscript.tmLanguage.json`,TextMate 语法):
  - 注释(行 `//`、块 `/* */`)
  - 字符串 + `${expr}` 插值(嵌套表达式内部继续高亮关键字/数字/操作符)
  - 数字:整数、浮点、科学计数法、`0x` 十六进制、`0b` 二进制
  - 关键字按语义分组分开 scope:控制流(`if/else/switch/case/default/while/for/each/return/break/continue`)、声明(`number/string/bool/group/byte/bit/void/event/function/var`)、反应式(`when/changed/assigned/once/until/guard/with/before/after/emit`,`:=` 单独高亮成 `keyword.operator.reactive`)、其它(`delete/drop/copy/turn/self`)
  - 精炼类型 `number<int>` / `number<float>` / `number<string>` / `number<string>:2`(定点位数)/ `event<group>` / `event<string>`
  - 冒号配置位 `turn:on` / `turn:off` / `copy:deep` / `copy:shallow` 等裸词修饰符
  - 前端容器(feature web):`container` 上下文关键字 + PascalCase 容器名(`Box`/`Row`/`Column`/`Grid`/`Text`/`Button`/...)高亮成 `support.class`
  - 函数调用高亮
- **代码片段**(`snippets/whenscript.json`):`when` / `whenwith`(event-when + with)/ `changed` / `event` / `emit` / `group`(反应式实体)/ `groupuntil`(带生命周期的实体)/ `function` / `import`,占位符齐全、`Tab` 跳位。
- **语言客户端**(`src/extension.js`,纯 JS 无编译步骤):用 `vscode-languageclient` 起 `<whenscript.lspPath> lsp`,失败时优雅降级(见上一节),不影响语法高亮。

## 一个已知的语言事实(供维护者参考)

早期设计文档里出现过 `*group name { ... }`(星号前缀)的实体语法;现在的规范实现里这个 `*` 前缀已经被拿掉了(`group name = { ... }`,body 里有 `when`/`changed` 就自动是反应式实体,纯数据字面量长得一模一样)。这个扩展的语法高亮按**当前真实语法**(即 `group name = { ... } [until(...)]`)来,没有实现已废弃的 `*group` 写法。匿名实体表达式(值位置的 `{ ... }`)同样不需要 `*` 前缀。

## 目录结构

```
editor/vscode-whenscript/
├── package.json                       扩展清单
├── language-configuration.json        注释/括号/缩进配置
├── syntaxes/whenscript.tmLanguage.json TextMate 语法
├── snippets/whenscript.json           代码片段
├── src/extension.js                   激活入口(LSP 客户端,纯 JS)
├── icon.png                           扩展图标(256x256,scripts/gen-icon.mjs 生成)
├── scripts/gen-icon.mjs               零依赖生成 icon.png 的脚本(打包时排除)
├── LICENSE                            MIT 协议 Plus(附署名要求 + 专利防御条款,见文件内条款)
├── CHANGELOG.md                       版本更新日志(Marketplace 会展示)
├── 发布指南.md                         从零到上架 Marketplace 的完整步骤(打包时排除)
├── demo.when                          高亮测试样例(不是能跑的程序)
├── .vscodeignore                      打包时排除的文件
└── README.md                          本文件
```
