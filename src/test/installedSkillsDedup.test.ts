import assert from 'assert';
import path from 'path';

type SkillLike = {
  name: string;
  level: 'project' | 'user';
  agent: string;
  path: string;
};

function normalizePathKey(value: string): string {
  return path.normalize(path.resolve(value)).toLowerCase();
}

function buildSkillDedupKey(skill: SkillLike): string {
  return [
    skill.level,
    skill.agent.toLowerCase(),
    normalizePathKey(skill.path),
    skill.name.toLowerCase()
  ].join('|');
}

function dedupe(skills: SkillLike[]): SkillLike[] {
  const seen = new Set<string>();
  const result: SkillLike[] = [];
  for (const skill of skills) {
    const key = buildSkillDedupKey(skill);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}

const sameTargetViaDifferentAgents: SkillLike[] = [
  {
    name: 'mobile-ios-design',
    level: 'user',
    agent: 'universal',
    path: 'C:\\Users\\tester\\.agents\\skills\\mobile-ios-design\\SKILL.md'
  },
  {
    name: 'mobile-ios-design',
    level: 'user',
    agent: 'codebuddy',
    path: 'C:\\Users\\tester\\.codebuddy\\skills\\mobile-ios-design\\SKILL.md'
  }
];

const crossAgent = dedupe(sameTargetViaDifferentAgents);
assert.strictEqual(crossAgent.length, 2, 'cross-agent entries must both be kept');

const sameAgentDuplicate: SkillLike[] = [
  {
    name: 'mobile-ios-design',
    level: 'user',
    agent: 'codebuddy',
    path: 'C:\\Users\\tester\\.codebuddy\\skills\\mobile-ios-design\\SKILL.md'
  },
  {
    name: 'mobile-ios-design',
    level: 'user',
    agent: 'codebuddy',
    path: 'C:\\Users\\tester\\.codebuddy\\skills\\mobile-ios-design\\SKILL.md'
  }
];

const sameAgent = dedupe(sameAgentDuplicate);
assert.strictEqual(sameAgent.length, 1, 'same-agent duplicate should be removed');

console.log('installedSkills dedupe tests passed');
