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
const fs = __importStar(require("fs"));
const yaml_1 = require("yaml");
const agentPathResolver_1 = require("./agentPathResolver");
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
async function readSkillLockMap() {
    const map = new Map();
    const lockPath = path.join(os.homedir(), '.agents', '.skill-lock.json');
    try {
        const content = await fs.promises.readFile(lockPath, 'utf8');
        const parsed = JSON.parse(content);
        const skills = parsed?.skills && typeof parsed.skills === 'object' ? parsed.skills : {};
        for (const [name, entry] of Object.entries(skills)) {
            if (!name)
                continue;
            const source = entry?.source;
            const sourceUrl = entry?.sourceUrl;
            map.set(name.toLowerCase(), {
                source: typeof source === 'string' ? source : undefined,
                sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : undefined
            });
        }
    }
    catch {
        return map;
    }
    return map;
}
async function readSkillFile(skillMdPath, fallbackName, level, agent, agentLabel, isUniversal, lockMap) {
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
        const name = frontmatter.name || fallbackName;
        const lockEntry = lockMap.get(name.toLowerCase());
        return {
            name,
            description: frontmatter.description || '',
            path: skillMdPath,
            level,
            agent,
            agentLabel,
            isUniversal,
            updatedAt,
            source: lockEntry?.source,
            sourceUrl: lockEntry?.sourceUrl
        };
    }
    catch {
        const lockEntry = lockMap.get(fallbackName.toLowerCase());
        return {
            name: fallbackName,
            description: '',
            path: skillMdPath,
            level,
            agent,
            agentLabel,
            isUniversal,
            updatedAt,
            source: lockEntry?.source,
            sourceUrl: lockEntry?.sourceUrl
        };
    }
}
async function scanDirectory(dirPath, level, agent, agentLabel, isUniversal, lockMap) {
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
            skills.push(await readSkillFile(skillMdPath, name, level, agent, agentLabel, isUniversal, lockMap));
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
        skills.push(await readSkillFile(skillMdPath, fallbackName, level, agent, agentLabel, isUniversal, lockMap));
    }
    return skills;
}
function normalizePathKey(value) {
    return path.normalize(path.resolve(value)).toLowerCase();
}
function buildSkillDedupKey(skill) {
    return [
        skill.level,
        skill.agent.toLowerCase(),
        normalizePathKey(skill.path),
        skill.name.toLowerCase()
    ].join('|');
}
function resolveAgentGlobalDir(agent, homeDir) {
    const globalDir = agent.globalSkillsDir?.trim();
    if (!globalDir) {
        return undefined;
    }
    return path.isAbsolute(globalDir) ? globalDir : path.join(homeDir, globalDir);
}
function mapSkillsToAgent(skills, agent) {
    return skills.map((skill) => ({
        ...skill,
        agent: agent.name,
        agentLabel: agent.displayName,
        isUniversal: false
    }));
}
async function scanInstalledSkills(agents) {
    const allSkills = [];
    if (!agents || agents.length === 0) {
        return allSkills;
    }
    const lockMap = await readSkillLockMap();
    const workspaceRoots = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);
    const seenSkillKeys = new Map();
    const homeDir = os.homedir();
    const mergeSkills = (skills) => {
        for (const skill of skills) {
            const key = buildSkillDedupKey(skill);
            if (!seenSkillKeys.has(key)) {
                seenSkillKeys.set(key, allSkills.length);
                allSkills.push(skill);
            }
        }
    };
    for (const agent of agents) {
        for (const root of workspaceRoots) {
            const dirPath = (0, agentPathResolver_1.resolveInstallDir)({
                agent,
                level: 'project',
                workspaceRoot: root,
                homeDir
            });
            if (!dirPath)
                continue;
            const skills = await scanDirectory(dirPath, 'project', agent.name, agent.displayName, false, lockMap);
            mergeSkills(skills);
        }
    }
    const scannedUserDirs = new Map();
    let universalDirKey;
    const firstUniversalAgent = agents.find((agent) => (0, agentPathResolver_1.isUniversalAgent)(agent));
    if (firstUniversalAgent) {
        const universalDir = (0, agentPathResolver_1.resolveInstallDir)({
            agent: firstUniversalAgent,
            level: 'user',
            homeDir
        });
        if (universalDir) {
            universalDirKey = normalizePathKey(universalDir);
            const universalSkills = await scanDirectory(universalDir, 'user', agentPathResolver_1.UNIVERSAL_AGENT_ID, agentPathResolver_1.UNIVERSAL_AGENT_LABEL, true, lockMap);
            scannedUserDirs.set(universalDirKey, universalSkills);
            mergeSkills(universalSkills);
        }
    }
    for (const agent of agents) {
        if (!(0, agentPathResolver_1.isUniversalAgent)(agent)) {
            continue;
        }
        const globalDir = resolveAgentGlobalDir(agent, homeDir);
        if (!globalDir) {
            continue;
        }
        const dirKey = normalizePathKey(globalDir);
        if (universalDirKey && dirKey === universalDirKey) {
            continue;
        }
        const cachedSkills = scannedUserDirs.get(dirKey);
        if (cachedSkills) {
            mergeSkills(mapSkillsToAgent(cachedSkills, agent));
            continue;
        }
        scannedUserDirs.set(dirKey, []);
        const skills = await scanDirectory(globalDir, 'user', agent.name, agent.displayName, false, lockMap);
        scannedUserDirs.set(dirKey, skills);
        mergeSkills(skills);
    }
    for (const agent of agents) {
        if ((0, agentPathResolver_1.isUniversalAgent)(agent)) {
            continue;
        }
        const userDir = (0, agentPathResolver_1.resolveInstallDir)({
            agent,
            level: 'user',
            homeDir
        });
        if (!userDir)
            continue;
        const dirKey = normalizePathKey(userDir);
        const cachedSkills = scannedUserDirs.get(dirKey);
        if (cachedSkills) {
            mergeSkills(mapSkillsToAgent(cachedSkills, agent));
            continue;
        }
        scannedUserDirs.set(dirKey, []);
        const skills = await scanDirectory(userDir, 'user', agent.name, agent.displayName, false, lockMap);
        scannedUserDirs.set(dirKey, skills);
        mergeSkills(skills);
    }
    return allSkills;
}
//# sourceMappingURL=installedSkillsService.js.map