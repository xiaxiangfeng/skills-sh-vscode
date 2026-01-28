import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { parse as parseYaml } from 'yaml';
import { AgentDefinition, Skill, SkillLevel } from '../types';

interface SkillFrontmatter {
  name?: string;
  description?: string;
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

async function readSkillFile(
  skillMdPath: string,
  fallbackName: string,
  level: SkillLevel,
  agent: string,
  agentLabel?: string
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

    return {
      name: frontmatter.name || fallbackName,
      description: frontmatter.description || '',
      path: skillMdPath,
      level,
      agent,
      agentLabel,
      updatedAt
    };
  } catch {
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

async function scanDirectory(
  dirPath: string,
  level: SkillLevel,
  agent: string,
  agentLabel?: string
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

function resolveProjectSkillsDir(agent: AgentDefinition, workspaceRoot: string): string | undefined {
  const skillsDir = agent.skillsDir?.trim();
  if (!skillsDir) return undefined;
  return path.isAbsolute(skillsDir) ? skillsDir : path.join(workspaceRoot, skillsDir);
}

function resolveUserSkillsDir(agent: AgentDefinition): string | undefined {
  const homeDir = os.homedir();
  const globalDir = agent.globalSkillsDir?.trim();
  if (globalDir) {
    return path.isAbsolute(globalDir) ? globalDir : path.join(homeDir, globalDir);
  }

  const skillsDir = agent.skillsDir?.trim();
  if (!skillsDir) return undefined;
  return path.isAbsolute(skillsDir) ? skillsDir : path.join(homeDir, skillsDir);
}

export async function scanInstalledSkills(agents: AgentDefinition[]): Promise<Skill[]> {
  const allSkills: Skill[] = [];
  if (!agents || agents.length === 0) {
    return allSkills;
  }

  const workspaceRoots = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath);

  for (const agent of agents) {
    const agentName = agent.name;
    const agentLabel = agent.displayName;

    for (const root of workspaceRoots) {
      const dirPath = resolveProjectSkillsDir(agent, root);
      if (!dirPath) continue;
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
