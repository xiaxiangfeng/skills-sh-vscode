import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SkillInstaller } from '../services/skillInstaller';
import { scanInstalledSkills } from '../services/installedSkillsService';
import { SkillsShClient } from '../services/skillsShClient';
import { loadAgentDefinitions } from '../services/agentRegistry';
import {
  AgentDefinition,
  MarketplaceCategory,
  MarketplaceCategoryState,
  SearchState,
  Skill,
  WebviewState
} from '../types';

interface MarketplaceCacheData {
  skills: MarketplaceCategoryState['skills'];
  totalCount?: number;
  timestamp: number;
}

const CACHE_KEY_INSTALLED = 'skillsSh.installed';
const CACHE_KEY_MARKETPLACE_PREFIX = 'skillsSh.marketplace.';

export class SkillsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'skillsShView';

  private view?: vscode.WebviewView;
  private readonly client = new SkillsShClient();
  private readonly installer: SkillInstaller;

  private installedSkills: Skill[] = [];
  private agentDefinitions: AgentDefinition[] = [];
  private marketplace: Record<MarketplaceCategory, MarketplaceCategoryState> = {
    all: { skills: [], totalCount: undefined, isLoading: false, error: null },
    trending: { skills: [], totalCount: undefined, isLoading: false, error: null },
    hot: { skills: [], totalCount: undefined, isLoading: false, error: null }
  };
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

    this.refreshInstalledSkills().then(() => this.updateWebview());
    this.fetchMarketplaceCategories();

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) return;
      this.refreshInstalledSkills().then(() => this.updateWebview());
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
          vscode.commands.executeCommand('simpleBrowser.show', message.url);
          break;
        default:
          break;
      }
    });
  }

  async refresh(force = false) {
    await this.refreshAgentDefinitions();
    await this.refreshInstalledSkills();
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
  }

  private getCacheTtlMs() {
    const minutes = vscode.workspace
      .getConfiguration('skillsSh')
      .get<number>('marketplace.cacheMinutes', 5);
    return Math.max(minutes, 1) * 60 * 1000;
  }

  private async refreshInstalledSkills() {
    this.installedSkills = await scanInstalledSkills(this.agentDefinitions);
    this.context.globalState.update(CACHE_KEY_INSTALLED, {
      data: this.installedSkills,
      timestamp: Date.now()
    });
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
      this.updateWebview();
    }
  }

  private openSkill(skillPath: string) {
    if (!skillPath) return;
    vscode.workspace.openTextDocument(skillPath).then((doc) => {
      vscode.window.showTextDocument(doc);
    });
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
      search: this.searchState
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
