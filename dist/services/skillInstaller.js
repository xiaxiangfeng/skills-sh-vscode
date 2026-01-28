"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillInstaller = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const agentRegistry_1 = require("./agentRegistry");
class SkillInstaller {
    context;
    output;
    constructor(context) {
        this.context = context;
        this.output = vscode.window.createOutputChannel('skills.sh');
    }
    async installSkill(options) {
        const flow = vscode.workspace.getConfiguration('skillsSh').get('install.flow', 'guided');
        if (flow === 'cli') {
            this.installViaCli(options);
            return false;
        }
        const selection = await this.promptForSelection();
        if (!selection)
            return false;
        const didInstall = await this.runInstall(options, selection);
        if (didInstall && selection.method === 'copy') {
            await this.convertSymlinksToCopies(selection);
        }
        return didInstall;
    }
    async promptForSelection() {
        const agents = await this.promptForAgents();
        if (!agents || agents.length === 0)
            return undefined;
        const scope = await this.promptForScope();
        if (!scope)
            return undefined;
        const method = await this.promptForMethod();
        if (!method)
            return undefined;
        const enableTelemetry = await this.promptForTelemetry();
        if (enableTelemetry === undefined)
            return undefined;
        return {
            level: scope.level,
            workspaceRoot: scope.workspaceRoot,
            agents,
            method,
            enableTelemetry
        };
    }
    async promptForAgents() {
        const agents = await (0, agentRegistry_1.loadAgentDefinitions)({
            extensionPath: this.context.extensionPath,
            storagePath: this.context.globalStorageUri?.fsPath
        });
        if (agents.length === 0) {
            vscode.window.showErrorMessage('No agents are available.');
            return undefined;
        }
        const lastSelected = this.context.globalState.get('skillsSh.lastSelectedAgents', []);
        const choice = await vscode.window.showQuickPick([
            {
                label: 'Same as last time (Recommended)',
                description: lastSelected.length > 0 ? `${lastSelected.length} agents` : 'No previous selection',
                target: 'last'
            },
            { label: 'All detected agents', description: 'Based on local agent folders', target: 'detected' },
            { label: 'Select specific agents', description: 'Choose from the full list', target: 'specific' }
        ], { title: 'Install to' });
        if (!choice)
            return undefined;
        if (choice.target === 'last' && lastSelected.length > 0) {
            const picked = agents.filter((agent) => lastSelected.includes(agent.name));
            if (picked.length > 0) {
                return picked;
            }
        }
        if (choice.target === 'detected') {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const detected = (0, agentRegistry_1.detectAgents)(agents, workspaceRoot);
            if (detected.length > 0) {
                void this.context.globalState.update('skillsSh.lastSelectedAgents', detected.map((agent) => agent.name));
                return detected;
            }
            vscode.window.showWarningMessage('No detected agents found. Please select specific agents.');
        }
        return this.promptForSpecificAgents(agents, lastSelected);
    }
    async promptForSpecificAgents(agents, lastSelected) {
        const items = agents.map((agent) => ({
            label: agent.displayName,
            description: agent.skillsDir,
            agent
        }));
        const selected = await new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            let accepted = false;
            quickPick.title = 'Select agents to install skills to';
            quickPick.canSelectMany = true;
            quickPick.items = items;
            quickPick.selectedItems = items.filter((item) => lastSelected.includes(item.agent.name));
            quickPick.onDidAccept(() => {
                accepted = true;
                const selection = [...quickPick.selectedItems];
                quickPick.hide();
                resolve(selection);
            });
            quickPick.onDidHide(() => {
                if (!accepted)
                    resolve(undefined);
                quickPick.dispose();
            });
            quickPick.show();
        });
        if (!selected || selected.length === 0)
            return undefined;
        const picked = selected.map((item) => item.agent);
        void this.context.globalState.update('skillsSh.lastSelectedAgents', picked.map((agent) => agent.name));
        return picked;
    }
    async promptForScope() {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const hasWorkspace = workspaceFolders.length > 0;
        const items = [
            { label: 'Project', description: hasWorkspace ? 'Install to current workspace' : 'No workspace open' },
            { label: 'User (Global)', description: 'Install to user directory' }
        ];
        const selection = await vscode.window.showQuickPick(items, {
            title: 'Installation scope'
        });
        if (!selection)
            return undefined;
        if (selection.label === 'Project') {
            if (!hasWorkspace) {
                vscode.window.showWarningMessage('No workspace is open. Using User (Global) scope instead.');
                return { level: 'user' };
            }
            if (workspaceFolders.length === 1) {
                return { level: 'project', workspaceRoot: workspaceFolders[0].uri.fsPath };
            }
            const workspacePick = await vscode.window.showQuickPick(workspaceFolders.map((folder) => ({
                label: folder.name,
                description: folder.uri.fsPath
            })), { title: 'Select workspace folder' });
            if (!workspacePick)
                return undefined;
            return { level: 'project', workspaceRoot: workspacePick.description || workspacePick.label };
        }
        return { level: 'user' };
    }
    async promptForMethod() {
        const items = [
            { label: 'Symlink (Recommended)', description: 'Single source of truth, easy updates' },
            { label: 'Copy to all agents', description: 'Independent copies for each agent' }
        ];
        const selection = await vscode.window.showQuickPick(items, {
            title: 'Installation method'
        });
        if (!selection)
            return undefined;
        return selection.label.startsWith('Symlink') ? 'symlink' : 'copy';
    }
    async promptForTelemetry() {
        const items = [
            { label: 'No', description: 'Do not send anonymous telemetry' },
            { label: 'Yes', description: 'Help rank skills on the leaderboard' }
        ];
        const selection = await vscode.window.showQuickPick(items, {
            title: 'Enable anonymous telemetry?',
            placeHolder: 'Telemetry only includes skill name and timestamp - no personal data'
        });
        if (!selection)
            return undefined;
        return selection.label === 'Yes';
    }
    async runInstall(options, selection) {
        const config = vscode.workspace.getConfiguration('skillsSh');
        const command = config.get('install.command', 'npx');
        const argsTemplate = config.get('install.args', ['skills', 'add', '{repo}']);
        const skillFlag = config.get('install.skillFlag', '--skill');
        const cwdMode = config.get('install.cwd', 'workspace');
        const usesSkillPlaceholder = argsTemplate.some((arg) => arg.includes('{skill}'));
        const args = this.buildArgs(argsTemplate, {
            repo: options.repo,
            skill: usesSkillPlaceholder ? options.skill : undefined
        });
        if (options.skill && !usesSkillPlaceholder && skillFlag) {
            args.push(skillFlag, options.skill);
        }
        if (selection.level === 'user') {
            args.push('-g');
        }
        for (const agent of selection.agents) {
            args.push('-a', agent.name);
        }
        args.push('-y');
        const cwd = this.resolveCwd(selection, cwdMode);
        if (!cwd) {
            vscode.window.showErrorMessage('No workspace folder is available for project installation.');
            return false;
        }
        const title = `Installing ${options.repo}...`;
        this.output.appendLine(`[install] ${command} ${args.join(' ')}`);
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false
        }, () => new Promise((resolve) => {
            const env = { ...process.env };
            if (!selection.enableTelemetry) {
                env.DISABLE_TELEMETRY = '1';
                env.SKILLS_NO_TELEMETRY = '1';
            }
            const child = (0, child_process_1.spawn)(command, args, { cwd, shell: true, env });
            let outputBuffer = '';
            let stderr = '';
            child.stdout?.on('data', (data) => {
                const text = data.toString();
                outputBuffer += text;
                this.output.append(text);
            });
            child.stderr?.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                outputBuffer += text;
                this.output.append(text);
            });
            child.on('error', (error) => {
                const message = `Install failed: ${error.message}`;
                vscode.window.showErrorMessage(message, 'Show Output').then((action) => {
                    if (action) {
                        this.output.show(true);
                    }
                });
                resolve(false);
            });
            child.on('close', (code) => {
                if (code === 0) {
                    const paths = this.buildInstallPaths(options, selection);
                    if (paths.length > 0) {
                        this.output.appendLine('');
                        this.output.appendLine('[install] Installed paths:');
                        paths.forEach((installedPath) => this.output.appendLine(`- ${installedPath}`));
                    }
                    const message = this.buildSuccessMessage(paths);
                    vscode.window.showInformationMessage(message, 'Show Output').then((action) => {
                        if (action) {
                            this.output.show(true);
                        }
                    });
                    resolve(true);
                    return;
                }
                const reason = this.buildFailureMessage(stderr, outputBuffer, code ?? 0);
                vscode.window.showErrorMessage(reason, 'Show Output').then((action) => {
                    if (action) {
                        this.output.show(true);
                    }
                });
                resolve(false);
            });
        }));
    }
    installViaCli(options) {
        const skillArg = options.skill ? ` --skill ${options.skill}` : '';
        const command = `npx skills add ${options.repo}${skillArg}`;
        const terminal = vscode.window.createTerminal('skills.sh install');
        terminal.show();
        terminal.sendText(command, true);
        vscode.window.showInformationMessage('Follow the prompts in the terminal to complete installation.');
    }
    buildArgs(template, options) {
        const replacements = {
            '{repo}': options.repo,
            '{skill}': options.skill
        };
        const result = [];
        for (const arg of template) {
            let resolved = arg;
            let skip = false;
            for (const [placeholder, value] of Object.entries(replacements)) {
                if (resolved.includes(placeholder)) {
                    if (!value) {
                        skip = true;
                        break;
                    }
                    resolved = resolved.replace(placeholder, value);
                }
            }
            if (!skip && resolved.trim()) {
                result.push(resolved);
            }
        }
        return result;
    }
    resolveCwd(selection, mode) {
        const workspaceRoot = selection.workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (selection.level === 'project') {
            return workspaceRoot;
        }
        if (mode === 'home') {
            return os.homedir() || this.context.extensionPath;
        }
        if (mode === 'extension') {
            return this.context.extensionPath;
        }
        return workspaceRoot || os.homedir() || this.context.extensionPath;
    }
    async convertSymlinksToCopies(selection) {
        const workspaceRoot = selection.workspaceRoot;
        const baseDir = selection.level === 'project' ? workspaceRoot : os.homedir();
        if (!baseDir)
            return;
        for (const agent of selection.agents) {
            const skillsDir = this.getAgentSkillsDir(agent, selection);
            if (!skillsDir)
                continue;
            let entries = [];
            try {
                entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                const entryPath = path.join(skillsDir, entry.name);
                try {
                    const stats = await fs.promises.lstat(entryPath);
                    if (stats.isSymbolicLink()) {
                        const targetPath = await fs.promises.readlink(entryPath);
                        const absoluteTarget = path.isAbsolute(targetPath)
                            ? targetPath
                            : path.resolve(path.dirname(entryPath), targetPath);
                        await fs.promises.rm(entryPath, { force: true, recursive: true });
                        await this.copyDirectory(absoluteTarget, entryPath);
                    }
                }
                catch {
                    continue;
                }
            }
        }
        try {
            const agentsBaseDir = path.join(baseDir, '.agents');
            if (fs.existsSync(agentsBaseDir)) {
                await fs.promises.rm(agentsBaseDir, { recursive: true, force: true });
            }
        }
        catch {
        }
    }
    getAgentSkillsDir(agent, selection) {
        const skillsDir = agent.skillsDir?.trim();
        if (!skillsDir)
            return undefined;
        if (selection.level === 'project') {
            if (!selection.workspaceRoot)
                return undefined;
            return path.join(selection.workspaceRoot, skillsDir);
        }
        const homeDir = os.homedir();
        const globalDir = agent.globalSkillsDir?.trim();
        if (globalDir) {
            return path.isAbsolute(globalDir) ? globalDir : path.join(homeDir, globalDir);
        }
        return path.join(homeDir, skillsDir);
    }
    async copyDirectory(src, dest) {
        await fs.promises.mkdir(dest, { recursive: true });
        const entries = await fs.promises.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            }
            else {
                await fs.promises.copyFile(srcPath, destPath);
            }
        }
    }
    buildInstallPaths(options, selection) {
        const skillName = options.skill?.trim();
        const paths = [];
        for (const agent of selection.agents) {
            const baseDir = this.getAgentSkillsDir(agent, selection);
            if (!baseDir)
                continue;
            paths.push(skillName ? path.join(baseDir, skillName) : baseDir);
        }
        const unique = Array.from(new Set(paths.map((value) => path.normalize(value))));
        return unique;
    }
    buildSuccessMessage(paths) {
        if (paths.length === 0) {
            return 'Skill installation complete.';
        }
        const primary = paths[0];
        if (paths.length === 1) {
            return `Skill installed to ${primary}`;
        }
        return `Skill installed to ${primary} (+${paths.length - 1} more)`;
    }
    buildFailureMessage(stderr, output, code) {
        const detail = this.pickFailureDetail(stderr) || this.pickFailureDetail(output);
        if (detail) {
            return `Install failed: ${detail}`;
        }
        return `Install failed with code ${code}`;
    }
    pickFailureDetail(text) {
        const lines = text
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        if (lines.length === 0) {
            return undefined;
        }
        const errorLine = [...lines].reverse().find((line) => /error|failed|exception|denied/i.test(line));
        return errorLine || lines[lines.length - 1];
    }
}
exports.SkillInstaller = SkillInstaller;
//# sourceMappingURL=skillInstaller.js.map