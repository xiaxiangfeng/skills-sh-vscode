# skills.sh - Skills 浏览器（VS Code 扩展）

在 VS Code 中直接浏览、搜索并安装 skills.sh 的技能。  
提供 All Time / Trending / Hot / Installed 的 Webview UI，以及与 `npx skills add` 体验一致的安装流程。

## 功能特性
- 浏览 skills.sh 列表：**All Time**、**Trending (24h)**、**Hot**
- 通过 `skills.sh/api/search` 搜索技能
- 安装技能（VS Code 引导流程或 CLI 交互）
- 管理已安装技能（多代理、多作用域）
- 已安装列表支持 **Type** / **Time** 排序
- 一键刷新市场数据与本地安装列表
- Vite Webview（可选热更新）

## 环境要求
- VS Code `^1.85.0`
- Node.js（用于开发）

## 快速开始（开发）
```bash
npm install
npm run dev           # 扩展端（tsc watch）
npm run dev:webview   # Webview 端（Vite dev server）
```

然后按 **F5** 启动 Extension Development Host。

### 开启 Webview 热更新
在 **Extension Development Host** 设置中添加：
```json
"skillsSh.webview.devServerUrl": "http://127.0.0.1:5173"
```

随后执行 **Developer: Reload Window**。


## &#x4ECE; Marketplace &#x5B89;&#x88C5;
1) &#x6253;&#x5F00; VS Code &#x6269;&#x5C55;&#x9762;&#x677F;&#xFF08;`Ctrl+Shift+X`&#xFF09;
2) &#x641C;&#x7D22; `skills.sh - Skills Browser`
3) &#x70B9;&#x51FB; **&#x5B89;&#x88C5;**

Marketplace &#x9875;&#x9762;:
https://marketplace.visualstudio.com/items?itemName=xiaxiangfeng.skills-sh-vscode

## &#x4ECE; VSIX &#x5B89;&#x88C5;
&#x5982;&#x679C;&#x4F60;&#x6709;&#x6253;&#x5305;&#x597D;&#x7684; `.vsix`&#xFF1A
1) &#x6253;&#x5F00;&#x6269;&#x5C55;&#x9762;&#x677F;&#xFF08;`Ctrl+Shift+X`&#xFF09;
2) &#x70B9;&#x51FB;&#x53F3;&#x4E0A;&#x89D2; `...` &#x2192; **&#x4ECE; VSIX &#x5B89;&#x88C5;...**
3) &#x9009;&#x62E9; `.vsix` &#x6587;&#x4EF6;&#x5E76;&#x786E;&#x8BA4;

## 配置项
所有配置在 `skillsSh.*` 下：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `skillsSh.webview.devServerUrl` | `""` | Vite dev server 地址（开启 HMR） |
| `skillsSh.marketplace.cacheMinutes` | `5` | 市场数据缓存分钟数 |
| `skillsSh.install.flow` | `guided` | `guided`（VS Code 选择框）或 `cli`（终端交互） |
| `skillsSh.install.command` | `npx` | 安装命令可执行文件 |
| `skillsSh.install.args` | `["skills","add","{repo}"]` | 安装参数，支持 `{repo}` / `{skill}` |
| `skillsSh.install.skillFlag` | `--skill` | 安装时的 skill 参数名 |
| `skillsSh.install.cwd` | `workspace` | 工作目录：`workspace` / `home` / `extension` |

## Agents 列表解析逻辑
为了跟随 `skills` CLI 更新，agents 列表是动态解析的：

优先级：
1. 从本机 `npx` 缓存解析 `skills/dist/cli.mjs`
2. 读取扩展缓存的 agents 列表
3. 使用内置 `resources/agents.json`

如果需要更新 agents 列表，终端运行一次 `npx skills ...` 即可刷新缓存。

## 已安装技能扫描
通过扫描各 agent 的技能目录（`SKILL.md` / `*.md`）来发现已安装内容。  
同时支持 **Project** 与 **User (Global)** 两种作用域。

## 使用建议
- 在 Webview 里点击 **Install** 进行安装
- 安装失败时打开 **View → Output → skills.sh** 查看详情
- 点击视图标题栏的刷新图标可重新拉取数据

## 常见问题
**Webview 开发模式空白**
- 确认设置了 `skillsSh.webview.devServerUrl`
- 确认 `npm run dev:webview` 正在运行
- 执行 **Developer: Reload Window**

**安装失败**
- 打开 **Output → skills.sh** 查看具体报错
- 确认终端中 `npx skills` 可正常执行

## 项目结构
```
skills-sh-vscode/
  resources/        # 图标、agents.json
  src/              # 扩展端代码
  webview/          # Vue + Vite UI
```

## License
MIT
