import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface AgentDefinition {
  name: string;
  displayName: string;
  skillsDir: string;
  globalSkillsDir?: string;
}

export interface AgentRegistryOptions {
  extensionPath?: string;
  storagePath?: string;
}

export async function loadAgentDefinitions(options: AgentRegistryOptions = {}): Promise<AgentDefinition[]> {
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
    } catch {
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

export function detectAgents(agents: AgentDefinition[], workspaceRoot?: string): AgentDefinition[] {
  const homeDir = os.homedir();
  return agents.filter((agent) => isAgentDetected(agent, workspaceRoot, homeDir));
}

function isAgentDetected(agent: AgentDefinition, workspaceRoot: string | undefined, homeDir: string): boolean {
  const candidates = new Set<string>();
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
      } else if (homeDir) {
        candidates.add(path.join(homeDir, globalDir));
      }
    }
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return true;
      }
    } catch {
    }
  }

  return false;
}

async function findSkillsCliPath(): Promise<string | undefined> {
  const roots: string[] = [];
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
        if (!entry.isDirectory()) continue;
        const cliPath = path.join(root, entry.name, 'node_modules', 'skills', 'dist', 'cli.mjs');
        if (fs.existsSync(cliPath)) {
          return cliPath;
        }
      }
    } catch {
    }
  }

  return undefined;
}

function parseAgentsFromCli(content: string): AgentDefinition[] {
  const agents: AgentDefinition[] = [];
  const seen = new Set<string>();
  const pattern = /name:\s*"([^"]+)"\s*,\s*displayName:\s*"([^"]+)"\s*,\s*skillsDir:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;

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

function extractGlobalSkillsDir(content: string, startIndex: number): string | undefined {
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

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

async function readBundledAgents(extensionPath?: string): Promise<AgentDefinition[]> {
  if (!extensionPath) return [];
  const filePath = path.join(extensionPath, 'resources', 'agents.json');
  return readAgentsFile(filePath);
}

async function readCachedAgents(storagePath?: string): Promise<AgentDefinition[]> {
  if (!storagePath) return [];
  const filePath = path.join(storagePath, 'agents.json');
  return readAgentsFile(filePath);
}

async function writeCachedAgents(storagePath: string | undefined, agents: AgentDefinition[]): Promise<void> {
  if (!storagePath) return;
  try {
    await fs.promises.mkdir(storagePath, { recursive: true });
    const filePath = path.join(storagePath, 'agents.json');
    await fs.promises.writeFile(filePath, JSON.stringify(agents, null, 2), 'utf8');
  } catch {
  }
}

async function readAgentsFile(filePath: string): Promise<AgentDefinition[]> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data.filter((item) => item && typeof item.name === 'string' && typeof item.displayName === 'string');
    }
  } catch {
  }
  return [];
}
