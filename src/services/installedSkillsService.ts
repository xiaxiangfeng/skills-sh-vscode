import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { AgentDefinition, Skill, SkillLevel } from '../types';
import {
  isUniversalAgent,
  resolveInstallDir,
  UNIVERSAL_AGENT_ID,
  UNIVERSAL_AGENT_LABEL
} from './agentPathResolver';

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

interface SkillLockEntry {
  source?: string;
  sourceUrl?: string;
}

function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  try {
    return parseYaml(match[1]) as SkillFrontmatter;
  } catch {
    return {};
  }
}

async function readSkillLockMap(): Promise<Map<string, SkillLockEntry>> {
  const map = new Map<string, SkillLockEntry>();
  const lockPath = path.join(os.homedir(), '.agents', '.skill-lock.json');

  try {
    const content = await fs.promises.readFile(lockPath, 'utf8');
    const parsed = JSON.parse(content);
    const skills = parsed?.skills && typeof parsed.skills === 'object' ? parsed.skills : {};

    for (const [name, entry] of Object.entries(skills)) {
      if (!name) continue;
      const source = (entry as any)?.source;
      const sourceUrl = (entry as any)?.sourceUrl;
      map.set(name.toLowerCase(), {
        source: typeof source === 'string' ? source : undefined,
        sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : undefined
      });
    }
  } catch {
    return map;
  }

  return map;
}

async function readSkillFile(
  skillMdPath: string,
  fallbackName: string,
  level: SkillLevel,
  agent: string,
  agentLabel: string | undefined,
  isUniversal: boolean,
  lockMap: Map<string, SkillLockEntry>
): Promise<Skill> {
  const fileUri = vscode.Uri.file(skillMdPath);
  let updatedAt: number | undefined;

  try {
    const stat = await vscode.workspace.fs.stat(fileUri);
    updatedAt = stat.mtime;
  } catch {
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
  } catch {
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

async function scanDirectory(
  dirPath: string,
  level: SkillLevel,
  agent: string,
  agentLabel: string | undefined,
  isUniversal: boolean,
  lockMap: Map<string, SkillLockEntry>
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const dirUri = vscode.Uri.file(dirPath);

  try {
    const stat = await vscode.workspace.fs.stat(dirUri);
    if ((stat.type & vscode.FileType.Directory) === 0) {
      return skills;
    }
  } catch {
    return skills;
  }

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dirUri);
  } catch {
    return skills;
  }

  for (const [name, type] of entries) {
    if ((type & vscode.FileType.Directory) !== 0) {
      const candidates = ['SKILL.md', 'skill.md'];
      let skillFile: string | undefined;

      for (const candidate of candidates) {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(path.join(dirPath, name, candidate)));
          skillFile = candidate;
          break;
        } catch {
          continue;
        }
      }

      if (!skillFile) {
        continue;
      }

      const skillMdPath = path.join(dirPath, name, skillFile);
      skills.push(
        await readSkillFile(skillMdPath, name, level, agent, agentLabel, isUniversal, lockMap)
      );
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
    skills.push(
      await readSkillFile(skillMdPath, fallbackName, level, agent, agentLabel, isUniversal, lockMap)
    );
  }

  return skills;
}

function normalizePathKey(value: string): string {
  return path.normalize(path.resolve(value)).toLowerCase();
}

function buildSkillDedupKey(skill: Skill): string {
  return [
    skill.level,
    skill.agent.toLowerCase(),
    normalizePathKey(skill.path),
    skill.name.toLowerCase()
  ].join('|');
}

function resolveAgentGlobalDir(agent: AgentDefinition, homeDir: string): string | undefined {
  const globalDir = agent.globalSkillsDir?.trim();
  if (!globalDir) {
    return undefined;
  }

  return path.isAbsolute(globalDir) ? globalDir : path.join(homeDir, globalDir);
}

function mapSkillsToAgent(skills: Skill[], agent: AgentDefinition): Skill[] {
  return skills.map((skill) => ({
    ...skill,
    agent: agent.name,
    agentLabel: agent.displayName,
    isUniversal: false
  }));
}

export async function scanInstalledSkills(agents: AgentDefinition[]): Promise<Skill[]> {
  const allSkills: Skill[] = [];
  if (!agents || agents.length === 0) {
    return allSkills;
  }

  const lockMap = await readSkillLockMap();
  const workspaceRoots = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);
  const seenSkillKeys = new Map<string, number>();
  const homeDir = os.homedir();

  const mergeSkills = (skills: Skill[]) => {
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
      const dirPath = resolveInstallDir({
        agent,
        level: 'project',
        workspaceRoot: root,
        homeDir
      });
      if (!dirPath) continue;

      const skills = await scanDirectory(
        dirPath,
        'project',
        agent.name,
        agent.displayName,
        false,
        lockMap
      );
      mergeSkills(skills);
    }
  }

  const scannedUserDirs = new Map<string, Skill[]>();
  let universalDirKey: string | undefined;
  const firstUniversalAgent = agents.find((agent) => isUniversalAgent(agent));
  if (firstUniversalAgent) {
    const universalDir = resolveInstallDir({
      agent: firstUniversalAgent,
      level: 'user',
      homeDir
    });

    if (universalDir) {
      universalDirKey = normalizePathKey(universalDir);
      const universalSkills = await scanDirectory(
        universalDir,
        'user',
        UNIVERSAL_AGENT_ID,
        UNIVERSAL_AGENT_LABEL,
        true,
        lockMap
      );
      scannedUserDirs.set(universalDirKey, universalSkills);
      mergeSkills(universalSkills);
    }
  }

  for (const agent of agents) {
    if (!isUniversalAgent(agent)) {
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
    const skills = await scanDirectory(
      globalDir,
      'user',
      agent.name,
      agent.displayName,
      false,
      lockMap
    );
    scannedUserDirs.set(dirKey, skills);
    mergeSkills(skills);
  }

  for (const agent of agents) {
    if (isUniversalAgent(agent)) {
      continue;
    }

    const userDir = resolveInstallDir({
      agent,
      level: 'user',
      homeDir
    });
    if (!userDir) continue;

    const dirKey = normalizePathKey(userDir);
    const cachedSkills = scannedUserDirs.get(dirKey);
    if (cachedSkills) {
      mergeSkills(mapSkillsToAgent(cachedSkills, agent));
      continue;
    }

    scannedUserDirs.set(dirKey, []);
    const skills = await scanDirectory(
      userDir,
      'user',
      agent.name,
      agent.displayName,
      false,
      lockMap
    );
    scannedUserDirs.set(dirKey, skills);
    mergeSkills(skills);
  }

  return allSkills;
}
