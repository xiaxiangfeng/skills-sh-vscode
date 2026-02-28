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
exports.UNIVERSAL_AGENT_LABEL = exports.UNIVERSAL_AGENT_ID = exports.UNIVERSAL_SKILLS_DIR = void 0;
exports.isUniversalAgent = isUniversalAgent;
exports.getUniversalUserSkillsDir = getUniversalUserSkillsDir;
exports.resolveInstallDir = resolveInstallDir;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
exports.UNIVERSAL_SKILLS_DIR = '.agents/skills';
exports.UNIVERSAL_AGENT_ID = 'universal';
exports.UNIVERSAL_AGENT_LABEL = 'Universal (.agents/skills)';
function normalizeDir(value) {
    return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}
function isUniversalAgent(agent) {
    return normalizeDir(agent.skillsDir) === exports.UNIVERSAL_SKILLS_DIR;
}
function getUniversalUserSkillsDir(homeDir = os.homedir()) {
    return path.join(homeDir, '.agents', 'skills');
}
function resolveInstallDir(options) {
    const { agent, level, workspaceRoot } = options;
    const homeDir = options.homeDir || os.homedir();
    const skillsDir = agent.skillsDir?.trim();
    if (!skillsDir)
        return undefined;
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
//# sourceMappingURL=agentPathResolver.js.map