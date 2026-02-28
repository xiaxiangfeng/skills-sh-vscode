import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { SkillInstaller } from '../services/skillInstaller';
import { scanInstalledSkills } from '../services/installedSkillsService';
import { SkillsShClient } from '../services/skillsShClient';
import { loadAgentDefinitions } from '../services/agentRegistry';
import {
  AgentDefinition,
  MarketplaceCategory,
  MarketplaceCategoryState,
  MarketplaceSkill,
  SearchState,
  Skill,
  WebviewState
} from '../types';

interface MarketplaceCacheData {
  skills: MarketplaceCategoryState['skills'];
  totalCount?: number;
  timestamp: number;
}

interface UpdatesCacheData {
  data: Record<string, MarketplaceSkill>;
  timestamp: number;
}

const CACHE_KEY_INSTALLED = 'skillsSh.installed';
const CACHE_KEY_MARKETPLACE_PREFIX = 'skillsSh.marketplace.';
const CACHE_KEY_UPDATES = 'skillsSh.updates';

export class SkillsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'skillsShView';

  private view?: vscode.WebviewView;
  private readonly client = new SkillsShClient();
  private readonly installer: SkillInstaller;
  private readonly output: vscode.OutputChannel;

  private installedSkills: Skill[] = [];
  private agentDefinitions: AgentDefinition[] = [];
  private marketplace: Record<MarketplaceCategory, MarketplaceCategoryState> = {
    all: { skills: [], totalCount: undefined, isLoading: false, error: null },
    trending: { skills: [], totalCount: undefined, isLoading: false, error: null },
    hot: { skills: [], totalCount: undefined, isLoading: false, error: null }
  };
  private updates: Record<string, MarketplaceSkill> = {};
  private lastUpdateCount = 0;
  private isUpdateCheckRunning = false;
  private searchState: SearchState = {
    query: '',
    results: [],
    isLoading: false,
    error: null
  };
  private hasInitializedWebview = false;
  private searchRequestId = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    this.installer = new SkillInstaller(context);
    this.output = vscode.window.createOutputChannel('skills.sh');
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;
    this.hasInitializedWebview = false;

    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot]
    };

    await this.refreshAgentDefinitions();
    this.loadFromCache();
    this.updateWebview();

    this.refreshInstalledSkills().then(async () => {
      await this.refreshUpdateHints(true);
      this.updateWebview();
    });
    this.fetchMarketplaceCategories();

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) return;
      this.refreshInstalledSkills().then(async () => {
        await this.refreshUpdateHints(true);
        this.updateWebview();
      });
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'install':
          await this.handleInstall(message.repo, message.skill);
          break;
        case 'deleteSkill':
          await this.deleteSkill(message.path, message.name);
          break;
        case 'openSkill':
          this.openSkill(message.path);
          break;
        case 'openSkillDir':
          this.openSkillDir(message.path);
          break;
        case 'refresh':
          await this.refresh(true);
          break;
        case 'search':
          await this.searchMarketplace(message.query || '');
          break;
        case 'setCategory':
          if (this.isMarketplaceCategory(message.category)) {
            await this.fetchMarketplaceCategory(message.category);
          }
          break;
        case 'openUrl':
          if (message.url) {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;
        case 'updateAll':
          await this.handleUpdateAll();
          break;
        default:
          break;
      }
    });
  }

  async refresh(force = false) {
    await this.refreshAgentDefinitions();
    await this.refreshInstalledSkills();
    await this.refreshUpdateHints(force);
    await this.fetchMarketplaceCategories(force);
    if (this.searchState.query) {
      await this.searchMarketplace(this.searchState.query, true);
    }
    this.updateWebview();
  }

  async installRepo(repo: string) {
    await this.handleInstall(repo);
  }

  private loadFromCache() {
    const cachedInstalled = this.context.globalState.get<{ data: Skill[]; timestamp: number }>(
      CACHE_KEY_INSTALLED
    );
    if (cachedInstalled?.data) {
      this.installedSkills = cachedInstalled.data;
    }

    const categories: MarketplaceCategory[] = ['all', 'trending', 'hot'];
    for (const category of categories) {
      const cached = this.context.globalState.get<MarketplaceCacheData>(
        `${CACHE_KEY_MARKETPLACE_PREFIX}${category}`
      );
      if (cached?.skills) {
        this.marketplace[category] = {
          skills: cached.skills,
          totalCount: cached.totalCount,
          isLoading: false,
          error: null
        };
      }
    }

    const cachedUpdates = this.context.globalState.get<UpdatesCacheData>(CACHE_KEY_UPDATES);
    if (cachedUpdates?.data) {
      this.updates = cachedUpdates.data;
      this.lastUpdateCount = Object.keys(this.updates).length;
    }
  }

  private getCacheTtlMs() {
    const minutes = vscode.workspace
      .getConfiguration('skillsSh')
      .get<number>('marketplace.cacheMinutes', 5);
    return Math.max(minutes, 1) * 60 * 1000;
  }

  private getUpdateCacheTtlMs() {
    const minutes = vscode.workspace
      .getConfiguration('skillsSh')
      .get<number>('updates.cacheMinutes', 10);
    return Math.max(minutes, 1) * 60 * 1000;
  }

  private isUpdateAutoCheckEnabled() {
    return vscode.workspace
      .getConfiguration('skillsSh')
      .get<boolean>('updates.autoCheck', true);
  }

  private getUpdateCommand() {
    return vscode.workspace
      .getConfiguration('skillsSh')
      .get<string>('updates.command', 'npx');
  }

  private getUpdateCheckArgs() {
    return vscode.workspace
      .getConfiguration('skillsSh')
      .get<string[]>('updates.checkArgs', ['skills', 'check']);
  }

  private getUpdateAllArgs() {
    return vscode.workspace
      .getConfiguration('skillsSh')
      .get<string[]>('updates.updateArgs', ['skills', 'update']);
  }

  private resolveUpdateCwd(): string {
    const mode = vscode.workspace
      .getConfiguration('skillsSh')
      .get<string>('updates.cwd', 'home');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (mode === 'workspace' && workspaceRoot) {
      return workspaceRoot;
    }
    if (mode === 'extension') {
      return this.context.extensionPath;
    }
    return os.homedir() || workspaceRoot || this.context.extensionPath;
  }

  private async refreshInstalledSkills() {
    this.installedSkills = await scanInstalledSkills(this.agentDefinitions);
    this.context.globalState.update(CACHE_KEY_INSTALLED, {
      data: this.installedSkills,
      timestamp: Date.now()
    });
  }

  private async refreshUpdateHints(force = false) {
    if (!this.isUpdateAutoCheckEnabled()) {
      this.updates = {};
      return;
    }

    if (!force) {
      const cached = this.context.globalState.get<UpdatesCacheData>(CACHE_KEY_UPDATES);
      const ttl = this.getUpdateCacheTtlMs();
      const isCacheValid = cached && Date.now() - cached.timestamp < ttl;
      if (isCacheValid && cached.data) {
        this.updates = cached.data;
        return;
      }
    }

    if (this.isUpdateCheckRunning) {
      return;
    }

    this.isUpdateCheckRunning = true;
    try {
      const updates = await this.runCliCheckUpdates();
      if (!updates) {
        return;
      }

      this.updates = updates;
      this.context.globalState.update(CACHE_KEY_UPDATES, {
        data: updates,
        timestamp: Date.now()
      } as UpdatesCacheData);
      this.maybeNotifyUpdates(updates);
    } finally {
      this.isUpdateCheckRunning = false;
    }
  }

  private async refreshAgentDefinitions() {
    this.agentDefinitions = await loadAgentDefinitions({
      extensionPath: this.context.extensionPath,
      storagePath: this.context.globalStorageUri?.fsPath
    });
  }

  private async fetchMarketplaceCategories(force = false) {
    const categories: MarketplaceCategory[] = ['all', 'trending', 'hot'];
    await Promise.all(categories.map((category) => this.fetchMarketplaceCategory(category, force)));
  }

  private async fetchMarketplaceCategory(category: MarketplaceCategory, force = false) {
    const state = this.marketplace[category];
    if (state.isLoading) return;

    if (!force) {
      const cached = this.context.globalState.get<MarketplaceCacheData>(
        `${CACHE_KEY_MARKETPLACE_PREFIX}${category}`
      );
      const ttl = this.getCacheTtlMs();
      const isCacheValid = cached && Date.now() - cached.timestamp < ttl;
      if (isCacheValid && cached.skills.length > 0) {
        this.marketplace[category] = {
          skills: cached.skills,
          totalCount: cached.totalCount,
          isLoading: false,
          error: null
        };
        return;
      }
    }

    this.marketplace[category] = { ...state, isLoading: true, error: null };
    this.updateWebview();

    try {
      const result = await this.client.fetchCategory(category);
      if (result.skills.length === 0) {
        this.marketplace[category] = {
          skills: [],
          totalCount: result.totalCount,
          isLoading: false,
          error: 'No skills found in response. Try refreshing.'
        };
      } else {
        this.marketplace[category] = {
          skills: result.skills,
          totalCount: result.totalCount,
          isLoading: false,
          error: null
        };
        this.context.globalState.update(`${CACHE_KEY_MARKETPLACE_PREFIX}${category}`, {
          skills: result.skills,
          totalCount: result.totalCount,
          timestamp: Date.now()
        } as MarketplaceCacheData);
      }
    } catch (error: any) {
      this.marketplace[category] = {
        ...state,
        isLoading: false,
        error: `Failed to load: ${error?.message || error}`
      };
    }

    this.updateWebview();
  }

  private async searchMarketplace(query: string, force = false) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      if (this.searchState.query) {
        this.searchState = { query: '', results: [], isLoading: false, error: null };
        this.updateWebview();
      }
      return;
    }

    if (!force && trimmed === this.searchState.query && this.searchState.results.length > 0) {
      return;
    }

    const requestId = ++this.searchRequestId;
    this.searchState = {
      query: trimmed,
      results: this.searchState.results,
      isLoading: true,
      error: null
    };
    this.updateWebview();

    try {
      const results = await this.client.search(trimmed);
      if (requestId !== this.searchRequestId) return;
      this.searchState = { query: trimmed, results, isLoading: false, error: null };
    } catch (error: any) {
      if (requestId !== this.searchRequestId) return;
      this.searchState = {
        query: trimmed,
        results: [],
        isLoading: false,
        error: `Search failed: ${error?.message || error}`
      };
    }

    this.updateWebview();
  }

  private async handleInstall(repo: string, skill?: string) {
    if (!repo) {
      vscode.window.showErrorMessage('Missing repository name.');
      return;
    }

    const didInstall = await this.installer.installSkill({ repo, skill });
    if (didInstall) {
      await this.refreshInstalledSkills();
      await this.refreshUpdateHints(true);
      this.updateWebview();
    }
  }

  private openSkill(skillPath: string) {
    if (!skillPath) return;
    vscode.workspace.openTextDocument(skillPath).then((doc) => {
      vscode.window.showTextDocument(doc);
    });
  }

  private openSkillDir(skillPath: string) {
    if (!skillPath) return;

    const normalizedPath = path.normalize(skillPath);
    const isMarkdown = path.extname(normalizedPath).toLowerCase() === '.md';
    const targetDir = isMarkdown ? path.dirname(normalizedPath) : normalizedPath;

    vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetDir));
  }

  private async deleteSkill(skillPath: string, name: string) {
    if (!skillPath || !name) return;

    const matching = this.installedSkills.filter((skill) => skill.name === name);
    let removeAll = false;
    let confirmLabel = 'Delete';

    if (matching.length > 1) {
      const choice = await vscode.window.showWarningMessage(
        `Skill "${name}" is installed for multiple agents. Remove from all agents?`,
        { modal: true },
        'Remove all',
        'Remove this'
      );

      if (!choice) {
        return;
      }

      removeAll = choice === 'Remove all';
      confirmLabel = removeAll ? 'Remove all' : 'Remove this';
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete skill "${name}"?`,
      { modal: true },
      confirmLabel
    );

    if (confirm !== confirmLabel) {
      return;
    }

    try {
      const targets = removeAll ? matching.map((skill) => skill.path) : [skillPath];
      const deletedTargets = new Set<string>();
      const resolvedTargets = new Set<string>();

      for (const target of targets) {
        const { targetPath, resolvedTarget } = await this.deleteSkillPath(target);
        deletedTargets.add(path.normalize(targetPath).toLowerCase());
        if (resolvedTarget) {
          resolvedTargets.add(resolvedTarget);
        }
      }

      for (const resolvedTarget of resolvedTargets) {
        const normalized = path.normalize(resolvedTarget).toLowerCase();
        if (normalized.includes(`${path.sep}.agents${path.sep}skills${path.sep}`) && !deletedTargets.has(normalized)) {
          await fs.promises.rm(resolvedTarget, { recursive: true, force: true });
        }
      }

      await this.refreshInstalledSkills();
      await this.refreshUpdateHints(true);
      this.updateWebview();
      vscode.window.showInformationMessage(`Skill "${name}" deleted.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete skill: ${error}`);
    }
  }

  private async deleteSkillPath(skillPath: string): Promise<{ targetPath: string; resolvedTarget?: string }> {
    const normalizedPath = path.normalize(skillPath);
    const baseName = path.basename(normalizedPath).toLowerCase();
    const isSkillMarkdown = baseName === 'skill.md';
    const targetPath = isSkillMarkdown ? path.dirname(normalizedPath) : normalizedPath;
    let resolvedTarget: string | undefined;

    try {
      const stats = await fs.promises.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        resolvedTarget = await fs.promises.realpath(targetPath);
      }
    } catch {
      resolvedTarget = undefined;
    }

    await fs.promises.rm(targetPath, { recursive: true, force: true });
    return { targetPath, resolvedTarget };
  }

  private async handleUpdateAll() {
    const didUpdate = await this.runCliUpdateAll();
    if (didUpdate) {
      await this.refreshInstalledSkills();
      await this.refreshUpdateHints(true);
      this.updateWebview();
    }
  }

  private async runCliUpdateAll(): Promise<boolean> {
    const command = this.getUpdateCommand();
    const args = this.getUpdateAllArgs();
    const cwd = this.resolveUpdateCwd();

    this.output.appendLine(`[update] ${command} ${args.join(' ')}`);

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating skills...',
        cancellable: false
      },
      async () => {
        const result = await this.spawnProcess(command, args, cwd);
        if (result.code === 0) {
          vscode.window.showInformationMessage('Skills updated successfully.', 'Show Output').then((action) => {
            if (action) this.output.show(true);
          });
          return true;
        }

        const message = result.error || result.stderr || 'Update failed.';
        vscode.window.showErrorMessage(message, 'Show Output').then((action) => {
          if (action) this.output.show(true);
        });
        return false;
      }
    );
  }

  private async runCliCheckUpdates(): Promise<Record<string, MarketplaceSkill> | undefined> {
    const command = this.getUpdateCommand();
    const args = this.getUpdateCheckArgs();
    const cwd = this.resolveUpdateCwd();

    this.output.appendLine(`[check] ${command} ${args.join(' ')}`);

    const result = await this.spawnProcess(command, args, cwd);
    if (result.code !== 0) {
      const message = result.error || result.stderr || 'Update check failed.';
      this.output.appendLine(`[check] ${message}`);
      return undefined;
    }

    return this.parseCliUpdatesOutput(result.stdout + '\n' + result.stderr);
  }

  private parseCliUpdatesOutput(output: string): Record<string, MarketplaceSkill> {
    const updates: Record<string, MarketplaceSkill> = {};
    const sanitized = this.stripAnsi(output);
    const lines = sanitized.split(/\r?\n/);
    let inUpdates = false;
    let pendingName: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/update\(s\)\s+available/i.test(trimmed)) {
        inUpdates = true;
        continue;
      }

      if (!inUpdates) continue;

      if (/^Run\s+npx\s+skills\s+update/i.test(trimmed)) {
        inUpdates = false;
        continue;
      }

      const sourceMatch = trimmed.match(/^source:\s*(.+)$/i);
      if (sourceMatch && pendingName) {
        const source = sourceMatch[1].trim();
        updates[pendingName] = this.buildUpdateEntry(pendingName, source);
        pendingName = undefined;
        continue;
      }

      const name = this.extractUpdateName(trimmed);
      if (name) {
        if (pendingName && !updates[pendingName]) {
          updates[pendingName] = this.buildUpdateEntry(pendingName);
        }
        pendingName = name;
      }
    }

    if (pendingName && !updates[pendingName]) {
      updates[pendingName] = this.buildUpdateEntry(pendingName);
    }

    return updates;
  }

  private stripAnsi(value: string): string {
    let cleaned = value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
    cleaned = cleaned.replace(/\[(?:\d{1,3};)*\d{1,3}m/g, '');
    cleaned = cleaned.replace(/\[\?25[hl]/gi, '');
    cleaned = cleaned.replace(/\[\]/g, '');
    return cleaned;
  }

  private extractUpdateName(value: string): string | undefined {
    const cleaned = value.replace(/^[^A-Za-z0-9]+/, '').trim();
    const match = cleaned.match(/^([A-Za-z0-9_.-]+)$/);
    return match?.[1];
  }

  private buildUpdateEntry(name: string, source?: string): MarketplaceSkill {
    let repo = source || '';
    if (repo.startsWith('https://')) {
      repo = repo.replace(/^https:\/\/(github\.com|gitlab\.com)\//, '');
    }

    const url = source?.startsWith('http') ? source : `https://skills.sh/${repo || name}/${name}`;
    return {
      name,
      repo: repo || name,
      installs: 'N/A',
      url,
      updatedAt: Date.now()
    };
  }

  private async spawnProcess(
    command: string,
    args: string[],
    cwd: string
  ): Promise<{ code: number; stdout: string; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: true, env: { ...process.env } });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        const cleaned = this.cleanOutputForChannel(text);
        if (cleaned) {
          this.output.append(cleaned);
        }
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        const cleaned = this.cleanOutputForChannel(text);
        if (cleaned) {
          this.output.append(cleaned);
        }
      });

      child.on('error', (error) => {
        resolve({ code: -1, stdout, stderr, error: error.message });
      });

      child.on('close', (code) => {
        resolve({ code: code ?? 0, stdout, stderr });
      });
    });
  }

  private maybeNotifyUpdates(updates: Record<string, MarketplaceSkill>) {
    const count = Object.keys(updates).length;
    if (count === 0) {
      this.lastUpdateCount = 0;
      return;
    }

    if (count === this.lastUpdateCount) {
      return;
    }

    this.lastUpdateCount = count;
    vscode.window
      .showInformationMessage(`${count} skill update(s) available.`, 'Update all', 'Show Output')
      .then((action) => {
        if (action === 'Update all') {
          this.handleUpdateAll();
        } else if (action === 'Show Output') {
          this.output.show(true);
        }
      });
  }

  private cleanOutputForChannel(text: string): string {
    if (!text) return '';

    let cleaned = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
    cleaned = cleaned.replace(/\[(?:\d{1,3};)*\d{1,3}m/g, '');
    cleaned = cleaned.replace(/\[\?25[hl]/gi, '');
    cleaned = cleaned.replace(/\[\]/g, '');
    cleaned = cleaned.replace(/\r(?!\n)/g, '\n');
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return cleaned;
  }

  private updateWebview() {
    if (!this.view) return;
    if (!this.hasInitializedWebview) {
      this.view.webview.html = this.getHtmlContent(this.view.webview);
      this.hasInitializedWebview = true;
    }

    this.view.webview.postMessage({
      command: 'state',
      payload: this.getWebviewState()
    });
  }

  private getWebviewState(): WebviewState {
    return {
      agents: this.agentDefinitions,
      installed: this.installedSkills,
      marketplace: this.marketplace,
      search: this.searchState,
      updates: this.updates
    };
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const mediaPath = vscode.Uri.joinPath(this.extensionUri, 'media');
    const htmlPath = vscode.Uri.joinPath(mediaPath, 'index.html');

    const devServerUrl = this.getDevServerUrl();
    if (devServerUrl) {
      return this.getDevServerHtml(webview, nonce, devServerUrl);
    }

    if (!fs.existsSync(htmlPath.fsPath)) {
      return this.getMissingBuildHtml(webview, nonce);
    }

    let html = fs.readFileSync(htmlPath.fsPath, 'utf-8');
    const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const baseUri = webview.asWebviewUri(mediaPath).toString();

    html = html.replace(/__CSP__/g, csp).replace(/__NONCE__/g, nonce);
    html = html.replace(/(src|href)="\.\/assets\//g, `$1="${baseUri}/assets/`);
    html = html.replace(/(src|href)="\/assets\//g, `$1="${baseUri}/assets/`);
    html = html.replace(/<script(?![^>]*nonce)/g, `<script nonce="${nonce}"`);

    return html;
  }

  private getDevServerUrl(): string | undefined {
    if (this.context.extensionMode !== vscode.ExtensionMode.Development) {
      return undefined;
    }

    const value = vscode.workspace
      .getConfiguration('skillsSh')
      .get<string>('webview.devServerUrl', '')
      .trim();

    return value ? value.replace(/\/$/, '') : undefined;
  }

  private getDevServerHtml(webview: vscode.Webview, nonce: string, devServerUrl: string): string {
    let origin = devServerUrl;
    try {
      origin = new URL(devServerUrl).origin;
    } catch {
      origin = devServerUrl;
    }

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data: ${origin}`,
      `style-src ${webview.cspSource} 'unsafe-inline' ${origin}`,
      `script-src 'nonce-${nonce}' ${origin} 'unsafe-eval'`,
      `connect-src ${origin} ws: wss:`
    ].join('; ');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>skills.sh</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}">
    import "${devServerUrl}/@vite/client";
    import "${devServerUrl}/src/main.ts";
  </script>
</body>
</html>`;
  }

  private getMissingBuildHtml(webview: vscode.Webview, nonce: string): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>skills.sh</title>
</head>
<body>
  <div style="padding:16px;color:var(--vscode-foreground);">
    Webview assets not found. Run "npm run build:webview" to generate the UI bundle.
  </div>
</body>
</html>`;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private isMarketplaceCategory(value: unknown): value is MarketplaceCategory {
    return value === 'all' || value === 'trending' || value === 'hot';
  }
}
