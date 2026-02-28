import * as os from 'os';
import * as path from 'path';
import { AgentDefinition, SkillLevel } from '../types';

export const UNIVERSAL_SKILLS_DIR = '.agents/skills';
export const UNIVERSAL_AGENT_ID = 'universal';
export const UNIVERSAL_AGENT_LABEL = 'Universal (.agents/skills)';

export interface ResolveInstallDirOptions {
  agent: AgentDefinition;
  level: SkillLevel;
  workspaceRoot?: string;
  homeDir?: string;
}

function normalizeDir(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

export function isUniversalAgent(agent: Pick<AgentDefinition, 'skillsDir'>): boolean {
  return normalizeDir(agent.skillsDir) === UNIVERSAL_SKILLS_DIR;
}

export function getUniversalUserSkillsDir(homeDir = os.homedir()): string {
  return path.join(homeDir, '.agents', 'skills');
}

export function resolveInstallDir(options: ResolveInstallDirOptions): string | undefined {
  const { agent, level, workspaceRoot } = options;
  const homeDir = options.homeDir || os.homedir();
  const skillsDir = agent.skillsDir?.trim();

  if (!skillsDir) return undefined;

  if (level === 'project') {
    if (!workspaceRoot) {
      return path.isAbsolute(skillsDir) ? skillsDir : undefined;
    }
    return path.isAbsolute(skillsDir) ? skillsDir : path.join(workspaceRoot, skillsDir);
  }

  if (isUniversalAgent(agent)) {
    return getUniversalUserSkillsDir(homeDir);
  }

  const globalDir = agent.globalSkillsDir?.trim();
  if (globalDir) {
    return path.isAbsolute(globalDir) ? globalDir : path.join(homeDir, globalDir);
  }

  return path.isAbsolute(skillsDir) ? skillsDir : path.join(homeDir, skillsDir);
}
