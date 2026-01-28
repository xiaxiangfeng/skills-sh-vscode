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
exports.scanInstalledSkills = scanInstalledSkills;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const yaml_1 = require("yaml");
function parseFrontmatter(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) {
        return {};
    }
    try {
        return (0, yaml_1.parse)(match[1]);
    }
    catch {
        return {};
    }
}
async function readSkillFile(skillMdPath, fallbackName, level, agent, agentLabel) {
    const fileUri = vscode.Uri.file(skillMdPath);
    let updatedAt;
    try {
        const stat = await vscode.workspace.fs.stat(fileUri);
        updatedAt = stat.mtime;
    }
    catch {
        updatedAt = undefined;
    }
    try {
        const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf-8');
        const frontmatter = parseFrontmatter(content);
        return {
            name: frontmatter.name || fallbackName,
            description: frontmatter.description || '',
            path: skillMdPath,
            level,
            agent,
            agentLabel,
            updatedAt
        };
    }
    catch {
        return {
            name: fallbackName,
            description: '',
            path: skillMdPath,
            level,
            agent,
            agentLabel,
            updatedAt
        };
    }
}
async function scanDirectory(dirPath, level, agent, agentLabel) {
    const skills = [];
    const dirUri = vscode.Uri.file(dirPath);
    try {
        const stat = await vscode.workspace.fs.stat(dirUri);
        if ((stat.type & vscode.FileType.Directory) === 0) {
            return skills;
        }
    }
    catch {
        return skills;
    }
    let entries;
    try {
        entries = await vscode.workspace.fs.readDirectory(dirUri);
    }
    catch {
        return skills;
    }
    for (const [name, type] of entries) {
        if ((type & vscode.FileType.Directory) !== 0) {
            const candidates = ['SKILL.md', 'skill.md'];
            let skillFile;
            for (const candidate of candidates) {
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(path.join(dirPath, name, candidate)));
                    skillFile = candidate;
                    break;
                }
                catch {
                    continue;
                }
            }
            if (!skillFile) {
                continue;
            }
            const skillMdPath = path.join(dirPath, name, skillFile);
            skills.push(await readSkillFile(skillMdPath, name, level, agent, agentLabel));
            continue;
        }
        if ((type & vscode.FileType.File) === 0) {
            continue;
        }
        const lowerName = name.toLowerCase();
        if (!lowerName.endsWith('.md') || lowerName === 'readme.md') {
            continue;
        }
        const skillMdPath = path.join(dirPath, name);
        const fallbackName = path.basename(name, path.extname(name));
        skills.push(await readSkillFile(skillMdPath, fallbackName, level, agent, agentLabel));
    }
    return skills;
}
function resolveProjectSkillsDir(agent, workspaceRoot) {
    const skillsDir = agent.skillsDir?.trim();
    if (!skillsDir)
        return undefined;
    return path.isAbsolute(skillsDir) ? skillsDir : path.join(workspaceRoot, skillsDir);
}
function resolveUserSkillsDir(agent) {
    const homeDir = os.homedir();
    const globalDir = agent.globalSkillsDir?.trim();
    if (globalDir) {
        return path.isAbsolute(globalDir) ? globalDir : path.join(homeDir, globalDir);
    }
    const skillsDir = agent.skillsDir?.trim();
    if (!skillsDir)
        return undefined;
    return path.isAbsolute(skillsDir) ? skillsDir : path.join(homeDir, skillsDir);
}
async function scanInstalledSkills(agents) {
    const allSkills = [];
    if (!agents || agents.length === 0) {
        return allSkills;
    }
    const workspaceRoots = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);
    for (const agent of agents) {
        const agentName = agent.name;
        const agentLabel = agent.displayName;
        for (const root of workspaceRoots) {
            const dirPath = resolveProjectSkillsDir(agent, root);
            if (!dirPath)
                continue;
            const skills = await scanDirectory(dirPath, 'project', agentName, agentLabel);
            allSkills.push(...skills);
        }
        const userDir = resolveUserSkillsDir(agent);
        if (userDir) {
            const skills = await scanDirectory(userDir, 'user', agentName, agentLabel);
            allSkills.push(...skills);
        }
    }
    return allSkills;
}
//# sourceMappingURL=installedSkillsService.js.map