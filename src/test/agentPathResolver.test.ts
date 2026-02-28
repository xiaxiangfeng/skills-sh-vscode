import assert from 'assert';
import path from 'path';
import { AgentDefinition } from '../types';
import { isUniversalAgent, resolveInstallDir } from '../services/agentPathResolver';

const homeDir = 'C:\\Users\\tester';
const workspaceRoot = 'D:\\workspace\\demo';

const codex: AgentDefinition = {
  name: 'codex',
  displayName: 'Codex',
  skillsDir: '.agents/skills',
  globalSkillsDir: '.codex/skills'
};

const codebuddy: AgentDefinition = {
  name: 'codebuddy',
  displayName: 'CodeBuddy',
  skillsDir: '.codebuddy/skills',
  globalSkillsDir: '.codebuddy/skills'
};

const cursor: AgentDefinition = {
  name: 'cursor',
  displayName: 'Cursor',
  skillsDir: '.cursor/skills',
  globalSkillsDir: 'C:\\Users\\tester\\.cursor\\skills'
};

assert.strictEqual(isUniversalAgent(codex), true);
assert.strictEqual(isUniversalAgent(codebuddy), false);

assert.strictEqual(
  resolveInstallDir({ agent: codex, level: 'user', homeDir }),
  path.join(homeDir, '.agents', 'skills')
);

assert.strictEqual(
  resolveInstallDir({ agent: codebuddy, level: 'user', homeDir }),
  path.join(homeDir, '.codebuddy', 'skills')
);

assert.strictEqual(
  resolveInstallDir({ agent: cursor, level: 'user', homeDir }),
  'C:\\Users\\tester\\.cursor\\skills'
);

assert.strictEqual(
  resolveInstallDir({ agent: codebuddy, level: 'project', workspaceRoot, homeDir }),
  path.join(workspaceRoot, '.codebuddy', 'skills')
);

console.log('agentPathResolver tests passed');
