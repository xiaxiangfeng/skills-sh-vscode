"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const path_1 = __importDefault(require("path"));
function normalizePathKey(value) {
    return path_1.default.normalize(path_1.default.resolve(value)).toLowerCase();
}
function buildSkillDedupKey(skill) {
    return [
        skill.level,
        skill.agent.toLowerCase(),
        normalizePathKey(skill.path),
        skill.name.toLowerCase()
    ].join('|');
}
function dedupe(skills) {
    const seen = new Set();
    const result = [];
    for (const skill of skills) {
        const key = buildSkillDedupKey(skill);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(skill);
    }
    return result;
}
const sameTargetViaDifferentAgents = [
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
assert_1.default.strictEqual(crossAgent.length, 2, 'cross-agent entries must both be kept');
const sameAgentDuplicate = [
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
assert_1.default.strictEqual(sameAgent.length, 1, 'same-agent duplicate should be removed');
console.log('installedSkills dedupe tests passed');
//# sourceMappingURL=installedSkillsDedup.test.js.map