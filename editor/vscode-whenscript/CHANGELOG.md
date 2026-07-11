# 更新日志

本项目的版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 0.2.3 — 2026-07-11

### 新增

- 语法高亮 + 悬浮文档跟上语言新增的 `continue` 语句(镜像 `break`,支持 `continue N` 多层,故意不支持 `continue -1`)——`keyword.control.flow.whenscript` 正则加 `continue`。

## 0.2.2 — 2026-07-11

### 修复

- **受限模式(Restricted Mode / 工作区未信任)下语法高亮完全不生效**:`package.json` 补上 `capabilities.untrustedWorkspaces`(`supported: true` + `restrictedConfigurations: ["whenscript.lspPath"]`)——之前没声明这个字段,VS Code 打开未信任的文件夹时会整体禁用本插件(含语法高亮),不仅仅是禁用 LSP。声明后语法高亮/代码片段在受限模式下也能正常工作,只有"跑本地二进制"的 `whenscript.lspPath` 这一项配置仍然要等信任了工作区才生效(避免不受信任的工作区 `.vscode/settings.json` 悄悄把这个路径指向恶意程序)。

### 新增(0.2.1 起累积,未单独发版)

- 文件图标:`contributes.languages[].icon` + 一套完整的 "WhenScript Icons" 图标主题(`icons/`),复用扩展自身图标的紫底青色"阶跃脉冲"视觉。
- `switch`(值匹配)代码片段。
- `LICENSE` 改为 "MIT 协议 Plus":公开发布/对外分发/部署上线时需署名,纯私下/内部使用不受约束。

## 0.2.0 — 2026-07-11

Marketplace 发布就绪的第一个版本:补齐图标 / License / 元数据,重打包发布。

### 新增

- 扩展图标 `icon.png`(256×256,几何风格"反应式脉冲"图形,零依赖手写 PNG 编码生成)。
- `LICENSE`(MIT 协议 Plus:在标准 MIT 基础上新增「公开发布/对外分发/部署上线时须署名」条款,纯私下/组织内部使用不受此约束)。
- `package.json` 补全 Marketplace 所需元数据:`categories`(`Programming Languages` / `Snippets` / `Formatters` / `Linters`)、更丰富的 `keywords`、打磨过的 `description`、`galleryBanner`。

### 无功能变化

本版本只涉及打包 / 元数据 / 文档,语法高亮、代码片段、语言客户端行为与 0.1.0 完全一致。

## 0.1.0 — 2026-07-11(首个内部版本,未发布 Marketplace)

- **语法高亮**(`syntaxes/whenscript.tmLanguage.json`):注释(`//`、`/* */`)、字符串与 `${expr}` 插值、数字(整数/浮点/科学计数法/`0x`/`0b`)、关键字按语义分组(控制流 / 声明 / 反应式 / 其它)、`:=` 反应式绑定运算符、精炼类型(`number<int>`/`number<float>`/`number<string>`/`number<string>:2`/`event<group>`/`event<string>`)、冒号配置位(`turn:on`/`copy:deep` 等)、前端容器(`container`、PascalCase 容器名)、函数调用高亮。
- **代码片段**(`snippets/whenscript.json`):`when`、`whenwith`、`changed`、`event`、`emit`、`group`、`groupuntil`、`function`、`import`,占位符齐全、`Tab` 可跳转。
- **语言配置**(`language-configuration.json`):注释符、括号对、自动闭合双引号、花括号自动缩进/回退缩进。
- **语言客户端**(`src/extension.js`):可选接入本地构建的 `whenscript` 二进制(`<lspPath> lsp`),提供诊断 / 悬停 / 补全;二进制不存在时优雅降级为纯语法高亮,不报错、不崩溃。
