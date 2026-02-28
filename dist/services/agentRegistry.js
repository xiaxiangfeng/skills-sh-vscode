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
exports.loadAgentDefinitions = loadAgentDefinitions;
exports.detectAgents = detectAgents;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
async function loadAgentDefinitions(options = {}) {
    const cached = await readCachedAgents(options.storagePath);
    const bundled = await readBundledAgents(options.extensionPath);
    const cliPath = await findSkillsCliPath();
    if (cliPath) {
        try {
            const content = await fs.promises.readFile(cliPath, 'utf8');
            const parsed = parseAgentsFromCli(content);
            if (parsed.length > 0) {
                const merged = mergeCliAgentsWithBundled(parsed, bundled);
                await writeCachedAgents(options.storagePath, merged);
                return merged;
            }
        }
        catch {
        }
    }
    if (cached.length > 0) {
        return cached;
    }
    if (bundled.length > 0) {
        return bundled;
    }
    return [];
}
function mergeCliAgentsWithBundled(cliAgents, bundledAgents) {
    if (!bundledAgents.length) {
        return cliAgents;
    }
    const bundledByName = new Map();
    for (const bundled of bundledAgents) {
        bundledByName.set(bundled.name, bundled);
    }
    return cliAgents.map((agent) => {
        if (agent.globalSkillsDir && agent.globalSkillsDir.trim()) {
            return agent;
        }
        const bundled = bundledByName.get(agent.name);
        if (!bundled) {
            return agent;
        }
        const primaryDir = normalizeSlashes(agent.skillsDir || '').trim();
        const fallbackDir = normalizeSlashes(bundled.globalSkillsDir || bundled.skillsDir || '').trim();
        if (!fallbackDir || fallbackDir === primaryDir) {
            return agent;
        }
        return {
            ...agent,
            globalSkillsDir: fallbackDir
        };
    });
}
function detectAgents(agents, workspaceRoot) {
    const homeDir = os.homedir();
    return agents.filter((agent) => isAgentDetected(agent, workspaceRoot, homeDir));
}
function isAgentDetected(agent, workspaceRoot, homeDir) {
    const candidates = new Set();
    const skillsDir = normalizeSlashes(agent.skillsDir);
    if (skillsDir) {
        const base = skillsDir.split('/')[0];
        if (workspaceRoot) {
            candidates.add(path.join(workspaceRoot, skillsDir));
            if (base) {
                candidates.add(path.join(workspaceRoot, base));
            }
        }
        if (homeDir) {
            candidates.add(path.join(homeDir, skillsDir));
            if (base) {
                candidates.add(path.join(homeDir, base));
            }
        }
    }
    if (agent.globalSkillsDir) {
        const globalDir = normalizeSlashes(agent.globalSkillsDir);
        if (globalDir) {
            if (path.isAbsolute(globalDir)) {
                candidates.add(globalDir);
            }
            else if (homeDir) {
                candidates.add(path.join(homeDir, globalDir));
            }
        }
    }
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) {
                return true;
            }
        }
        catch {
        }
    }
    return false;
}
async function findSkillsCliPath() {
    const roots = [];
    const localApp = process.env.LOCALAPPDATA;
    if (localApp) {
        roots.push(path.join(localApp, 'npm-cache', '_npx'));
    }
    const homeDir = os.homedir();
    if (homeDir) {
        roots.push(path.join(homeDir, '.npm', '_npx'));
        roots.push(path.join(homeDir, '.npm-cache', '_npx'));
    }
    for (const root of roots) {
        try {
            const entries = await fs.promises.readdir(root, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const cliPath = path.join(root, entry.name, 'node_modules', 'skills', 'dist', 'cli.mjs');
                if (fs.existsSync(cliPath)) {
                    return cliPath;
                }
            }
        }
        catch {
        }
    }
    return undefined;
}
function parseAgentsFromCli(content) {
    const agents = [];
    const seen = new Set();
    const pattern = /name:\s*"([^"]+)"\s*,\s*displayName:\s*"([^"]+)"\s*,\s*skillsDir:\s*"([^"]+)"/g;
    const matches = [];
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        const displayName = match[2];
        const skillsDir = match[3];
        matches.push({ name, displayName, skillsDir, index: match.index });
    }
    for (let i = 0; i < matches.length; i++) {
        const { name, displayName, skillsDir, index } = matches[i];
        if (!name || seen.has(name)) {
            continue;
        }
        const nextStart = i + 1 < matches.length ? matches[i + 1].index : content.length;
        const agentSlice = content.slice(index, nextStart);
        if (/showInUniversalList:\s*false/.test(agentSlice)) {
            continue;
        }
        const globalSkillsDir = extractGlobalSkillsDir(agentSlice);
        agents.push({
            name,
            displayName,
            skillsDir,
            globalSkillsDir
        });
        seen.add(name);
    }
    return agents;
}
function extractGlobalSkillsDir(agentSlice) {
    const direct = agentSlice.match(/globalSkillsDir:\s*"([^"]+)"/);
    if (direct?.[1]) {
        return direct[1];
    }
    const joined = agentSlice.match(/globalSkillsDir:\s*join\(\s*([^,]+?)\s*,\s*"([^"]+)"\s*\)/);
    if (joined?.[1] && joined?.[2]) {
        return resolveGlobalJoinPath(joined[1], joined[2]);
    }
    if (/globalSkillsDir:\s*getOpenClawGlobalSkillsDir\(\)/.test(agentSlice)) {
        return resolveOpenClawGlobalSkillsDir();
    }
    return undefined;
}
function resolveGlobalJoinPath(baseExpr, suffix) {
    const base = resolveGlobalBasePath(baseExpr);
    if (!base)
        return undefined;
    return path.join(base, normalizeSlashes(suffix));
}
function resolveGlobalBasePath(baseExpr) {
    const normalized = baseExpr.replace(/\s+/g, '');
    if (normalized === 'home' || normalized.includes('homedir()')) {
        return os.homedir();
    }
    if (normalized === 'configHome') {
        return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config');
    }
    if (normalized === 'codexHome') {
        return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
    }
    if (normalized === 'claudeHome') {
        return process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
    }
    return undefined;
}
function resolveOpenClawGlobalSkillsDir() {
    const homeDir = os.homedir();
    const candidates = ['.openclaw', '.clawdbot', '.moltbot'];
    for (const candidate of candidates) {
        const candidateDir = path.join(homeDir, candidate);
        if (fs.existsSync(candidateDir)) {
            return path.join(candidateDir, 'skills');
        }
    }
    return path.join(homeDir, '.openclaw', 'skills');
}
function normalizeSlashes(value) {
    return value.replace(/\\/g, '/');
}
async function readBundledAgents(extensionPath) {
    if (!extensionPath)
        return [];
    const filePath = path.join(extensionPath, 'resources', 'agents.json');
    return readAgentsFile(filePath);
}
async function readCachedAgents(storagePath) {
    if (!storagePath)
        return [];
    const filePath = path.join(storagePath, 'agents.json');
    return readAgentsFile(filePath);
}
async function writeCachedAgents(storagePath, agents) {
    if (!storagePath)
        return;
    try {
        await fs.promises.mkdir(storagePath, { recursive: true });
        const filePath = path.join(storagePath, 'agents.json');
        await fs.promises.writeFile(filePath, JSON.stringify(agents, null, 2), 'utf8');
    }
    catch {
    }
}
async function readAgentsFile(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
            return data.filter((item) => item && typeof item.name === 'string' && typeof item.displayName === 'string');
        }
    }
    catch {
    }
    return [];
}
//# sourceMappingURL=agentRegistry.js.map