# skills.sh - Skills Browser (VS Code Extension)

Browse, search, and install skills from skills.sh directly inside VS Code.  
This extension provides a webview UI with tabs for All Time / Trending / Hot / Installed and a guided install flow that mirrors the `npx skills add` experience.

## Features
- Browse skills.sh lists: **All Time**, **Trending (24h)**, **Hot**
- Search skills via `skills.sh/api/search`
- Install skills with a guided VS Code flow or the native CLI prompt
- Manage installed skills across multiple agents and scopes
- Sort installed skills by **Type** (grouped) or **Time**
- Refresh marketplace data and local installations
- Vite-powered webview with optional hot reload

## Requirements
- VS Code `^1.85.0`
- Node.js (for development)

## Quick Start (Development)
```bash
npm install
npm run dev           # extension (tsc watch)
npm run dev:webview   # webview (Vite dev server)
```

Then press **F5** to launch the Extension Development Host.

### Enable webview hot reload
Set this in the **Extension Development Host** settings:
```json
"skillsSh.webview.devServerUrl": "http://127.0.0.1:5173"
```

Then run **Developer: Reload Window** in the Extension Development Host.

## Install from Marketplace
1) Open the Extensions view in VS Code (`Ctrl+Shift+X`)
2) Search for `skills.sh - Skills Browser`
3) Click **Install**

Marketplace listing:
https://marketplace.visualstudio.com/items?itemName=xiaxiangfeng.skills-sh-vscode

## Install from VSIX
If you have a packaged `.vsix`:
1) Open the Extensions view (`Ctrl+Shift+X`)
2) Click the `...` menu → **Install from VSIX...**
3) Select the `.vsix` file and confirm

## Configuration
All settings live under `skillsSh.*`:

| Setting | Default | Description |
|---|---|---|
| `skillsSh.webview.devServerUrl` | `""` | Vite dev server URL (enables HMR) |
| `skillsSh.marketplace.cacheMinutes` | `5` | Marketplace cache duration |
| `skillsSh.install.flow` | `guided` | `guided` (VS Code pickers) or `cli` (terminal prompts) |
| `skillsSh.install.command` | `npx` | Install command executable |
| `skillsSh.install.args` | `["skills","add","{repo}"]` | Command args; supports `{repo}` / `{skill}` |
| `skillsSh.install.skillFlag` | `--skill` | Flag used for skill selection |
| `skillsSh.install.cwd` | `workspace` | Working dir: `workspace`, `home`, `extension` |

## Agents List Resolution
The extension uses a **dynamic agents list** so it stays in sync with the `skills` CLI:

Priority order:
1. Parse agents from the local `npx` cache (`skills/dist/cli.mjs`)
2. Use cached agents stored by the extension
3. Fallback to bundled `resources/agents.json`

If you want to update the agents list, run any `npx skills ...` command once to populate the cache.

## Installed Skills Scanning
Installed skills are discovered by checking agent-specific folders for `SKILL.md` or `*.md`.  
Both project and user scopes are supported based on each agent's directory config.

## Usage Tips
- Use the **Install** button in the webview to add a skill
- For troubleshooting, open **View → Output → skills.sh**
- Use the **Refresh** icon in the view title to reload data

## Troubleshooting
**Webview is blank in dev**
- Make sure `skillsSh.webview.devServerUrl` is set
- Confirm `npm run dev:webview` is running
- Run **Developer: Reload Window**

**Install fails**
- Open **Output → skills.sh** to see detailed errors
- Check your `npx skills` installation works in a terminal

## Project Structure
```
skills-sh-vscode/
  resources/        # icons, agents.json
  src/              # extension code
  webview/          # Vue + Vite UI
```

## License
MIT
