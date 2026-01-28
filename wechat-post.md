# 让 VS Code 直接变成 skills.sh 技能商店：我做了一个「Skills Browser」扩展

最近 **skills** 这个词非常火，很多 AI 工具都开始支持“技能/Skill”生态。

## 什么是 Skill？
**Skill** 是给 AI Agent 增强能力的“可复用任务模块”。它通常包含：
- 任务说明（Prompt / 指令）
- 执行步骤与最佳实践
- 适配不同 Agent 的规范（如 Cursor / Claude / Codex / Gemini 等）

简单理解：**Skill 就像 AI 的插件，让它能更专业地做某类工作。**

---

## 这个项目是做什么的？
**skills.sh - Skills Browser** 是一个 VS Code 扩展，
把 skills.sh 的技能市场直接搬进编辑器，做到：

- 浏览 All Time / Trending / Hot 榜单
- 搜索技能并一键安装
- 管理多 Agent、多作用域的已安装技能
- 不用在浏览器里手动复制安装命令

---

## 🌟 主要功能
- **市场浏览**：All Time / Trending (24h) / Hot
- **搜索技能**：接入 skills.sh API
- **安装技能**：引导式 VS Code 选择框
- **已安装管理**：分组折叠，支持删除/重装
- **热更新开发**：Vite Webview + HMR

---

## 🚀 如何使用
1. 在 VS Code 中安装扩展：`skills.sh - Skills Browser`
2. 打开左侧的 skills.sh 图标
3. 搜索技能并点击 Install
4. 选择 Agent / Scope / 安装方式
5. 安装完成后在 Installed 中管理

Marketplace：
https://marketplace.visualstudio.com/items?itemName=xiaxiangfeng.skills-sh-vscode

---

## 🔧 开发方式
```bash
npm install
npm run dev           # 扩展端
npm run dev:webview   # Webview 端
```
然后按 F5 启动 Extension Development Host。

---

## 项目地址
GitHub：
https://github.com/xiaxiangfeng/skills-sh-vscode

---

如果你也在关注 AI Agent 的技能生态，欢迎试用与交流。
