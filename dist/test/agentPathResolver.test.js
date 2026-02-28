"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const path_1 = __importDefault(require("path"));
const agentPathResolver_1 = require("../services/agentPathResolver");
const homeDir = 'C:\\Users\\tester';
const workspaceRoot = 'D:\\workspace\\demo';
const codex = {
    name: 'codex',
    displayName: 'Codex',
    skillsDir: '.agents/skills',
    globalSkillsDir: '.codex/skills'
};
const codebuddy = {
    name: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: '.codebuddy/skills'
};
const cursor = {
    name: 'cursor',
    displayName: 'Cursor',
    skillsDir: '.cursor/skills',
    globalSkillsDir: 'C:\\Users\\tester\\.cursor\\skills'
};
assert_1.default.strictEqual((0, agentPathResolver_1.isUniversalAgent)(codex), true);
assert_1.default.strictEqual((0, agentPathResolver_1.isUniversalAgent)(codebuddy), false);
assert_1.default.strictEqual((0, agentPathResolver_1.resolveInstallDir)({ agent: codex, level: 'user', homeDir }), path_1.default.join(homeDir, '.agents', 'skills'));
assert_1.default.strictEqual((0, agentPathResolver_1.resolveInstallDir)({ agent: codebuddy, level: 'user', homeDir }), path_1.default.join(homeDir, '.codebuddy', 'skills'));
assert_1.default.strictEqual((0, agentPathResolver_1.resolveInstallDir)({ agent: cursor, level: 'user', homeDir }), 'C:\\Users\\tester\\.cursor\\skills');
assert_1.default.strictEqual((0, agentPathResolver_1.resolveInstallDir)({ agent: codebuddy, level: 'project', workspaceRoot, homeDir }), path_1.default.join(workspaceRoot, '.codebuddy', 'skills'));
console.log('agentPathResolver tests passed');
//# sourceMappingURL=agentPathResolver.test.js.map