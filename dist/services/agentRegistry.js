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
                await writeCachedAgents(options.storagePath, parsed);
                return parsed;
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
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        const displayName = match[2];
        const skillsDir = match[3];
        if (!name || seen.has(name)) {
            continue;
        }
        const globalSkillsDir = extractGlobalSkillsDir(content, match.index);
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
function extractGlobalSkillsDir(content, startIndex) {
    const slice = content.slice(startIndex, startIndex + 400);
    const direct = slice.match(/globalSkillsDir:\s*"([^"]+)"/);
    if (direct?.[1]) {
        return direct[1];
    }
    const joined = slice.match(/globalSkillsDir:\s*join\([^,]+,\s*"([^"]+)"\)/);
    if (joined?.[1]) {
        return joined[1];
    }
    return undefined;
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