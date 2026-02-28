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
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const agentRegistry_1 = require("./agentRegistry");
const agentPathResolver_1 = require("./agentPathResolver");
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
        return this.runInstall(options, selection);
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
        return this.promptForSpecificAgents(agents);
    }
    async promptForSpecificAgents(agents) {
        const universalItems = [];
        const additionalItems = [];
        for (const agent of agents) {
            const universal = (0, agentPathResolver_1.isUniversalAgent)(agent);
            const item = {
                label: agent.displayName,
                description: `${agent.name} (${agent.skillsDir})`,
                detail: universal ? `${agentPathResolver_1.UNIVERSAL_AGENT_LABEL} - shared directory` : undefined,
                agent,
                alwaysIncluded: universal
            };
            if (universal) {
                universalItems.push(item);
            }
            else {
                additionalItems.push(item);
            }
        }
        const allItems = [];
        if (universalItems.length > 0) {
            allItems.push({
                label: 'Universal (.agents/skills) - always included',
                kind: vscode.QuickPickItemKind.Separator
            });
            allItems.push(...universalItems);
        }
        if (additionalItems.length > 0) {
            allItems.push({ label: 'Additional agents', kind: vscode.QuickPickItemKind.Separator });
            allItems.push(...additionalItems);
        }
        const enforceUniversalSelection = (selection) => {
            if (universalItems.length === 0) {
                return [...selection];
            }
            const merged = [...selection];
            for (const lockedItem of universalItems) {
                if (!merged.includes(lockedItem)) {
                    merged.push(lockedItem);
                }
            }
            return merged;
        };
        const selected = await new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            let accepted = false;
            quickPick.title = 'Select agents to install skills to';
            quickPick.placeholder =
                universalItems.length > 0
                    ? `Universal agents are preselected and shared via ${(0, agentPathResolver_1.getUniversalUserSkillsDir)()}.`
                    : 'Select one or more agents.';
            quickPick.canSelectMany = true;
            quickPick.items = allItems;
            quickPick.selectedItems = [...universalItems];
            quickPick.onDidChangeSelection((selection) => {
                const merged = enforceUniversalSelection(selection);
                if (merged.length !== selection.length) {
                    quickPick.selectedItems = merged;
                }
            });
            quickPick.onDidAccept(() => {
                const merged = enforceUniversalSelection(quickPick.selectedItems);
                const pickedAgents = merged
                    .map((item) => item.agent)
                    .filter((agent) => Boolean(agent));
                if (pickedAgents.length === 0) {
                    vscode.window.showWarningMessage('Select at least one agent.');
                    return;
                }
                accepted = true;
                quickPick.hide();
                resolve(pickedAgents);
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
        return selected;
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
        if (selection.method === 'copy') {
            args.push('--copy');
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
                const cleaned = this.cleanOutputForChannel(text);
                if (cleaned) {
                    this.output.append(cleaned);
                }
            });
            child.stderr?.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                outputBuffer += text;
                const cleaned = this.cleanOutputForChannel(text);
                if (cleaned) {
                    this.output.append(cleaned);
                }
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
                    this.output.appendLine('');
                    this.output.appendLine('[install] CLI determines final install locations.');
                    this.output.appendLine(`[install] Universal agents use ${(0, agentPathResolver_1.getUniversalUserSkillsDir)()}`);
                    this.output.appendLine('[install] Non-universal agents may be linked or copied to their own directories.');
                    const message = 'Skill installation complete. Final paths follow skills CLI semantics.';
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
    buildFailureMessage(stderr, output, code) {
        const details = [...this.pickFailureDetails(stderr), ...this.pickFailureDetails(output)];
        const uniqueDetails = Array.from(new Set(details.map((line) => line.trim()).filter(Boolean)));
        if (uniqueDetails.length > 0) {
            const maxLines = 2;
            const summary = uniqueDetails.slice(0, maxLines).join(' | ');
            const suffix = uniqueDetails.length > maxLines ? ` (+${uniqueDetails.length - maxLines} more)` : '';
            return `Install failed: ${summary}${suffix}`;
        }
        return `Install failed with code ${code}`;
    }
    pickFailureDetails(text) {
        const cleanedText = this.cleanOutputForChannel(text);
        const lines = cleanedText
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        if (lines.length === 0) {
            return [];
        }
        const keywordLineRegex = /error|failed|exception|denied|not found|no matching|invalid|missing|unable/i;
        const matched = lines.filter((line) => keywordLineRegex.test(line));
        if (matched.length > 0) {
            return matched.slice(-3);
        }
        return [lines[lines.length - 1]];
    }
    cleanOutputForChannel(text) {
        if (!text)
            return '';
        // Output panel does not interpret ANSI; strip escape sequences first.
        let cleaned = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
        // Some shells stringify color codes without ESC; remove leftover "[90m" fragments too.
        cleaned = cleaned.replace(/\[(?:\d{1,3};)*\d{1,3}m/g, '');
        cleaned = cleaned.replace(/\[\?25[hl]/gi, '');
        cleaned = cleaned.replace(/\[\]/g, '');
        // Normalize carriage-return based spinner updates so they don't render as control noise.
        cleaned = cleaned.replace(/\r(?!\n)/g, '\n');
        // Drop other non-printable control chars except tab/newline.
        cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        return cleaned;
    }
}
exports.SkillInstaller = SkillInstaller;
//# sourceMappingURL=skillInstaller.js.map