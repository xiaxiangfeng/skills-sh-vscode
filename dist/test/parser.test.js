"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const marketplaceParser_1 = require("../services/marketplaceParser");
const parser = new marketplaceParser_1.MarketplaceParser();
// Test JSON Parsing
console.log('Testing JSON Parsing...');
const jsonData = {
    skills: [
        { name: 'skill1', repo: 'user/skill1', installs: 100 },
        { name: 'skill2', repo: 'user/skill2', installs: '1.5K' }
    ],
    total: 50
};
const jsonResult = parser.parseResponse(JSON.stringify(jsonData), 'all');
assert_1.default.strictEqual(jsonResult.skills.length, 2);
assert_1.default.strictEqual(jsonResult.skills[0].name, 'skill1');
assert_1.default.strictEqual(jsonResult.skills[0].installs, '100');
assert_1.default.strictEqual(jsonResult.totalCount, 50);
console.log('JSON Parsing Passed.');
// Test HTML Parsing
console.log('Testing HTML Parsing...');
const htmlData = `
<div class="skills">
  <a href="/user/skill1">
    <h3>skill1</h3>
    <p>user/skill1</p>
    <span>100</span>
  </a>
  <a href="/user/skill2">
    <h3>skill2</h3>
    <p>user/skill2</p>
    <span>1.2K</span>
  </a>
</div>
<div>All Time (1234)</div>
`;
const htmlResult = parser.parseResponse(htmlData, 'all');
assert_1.default.strictEqual(htmlResult.skills.length, 2);
assert_1.default.strictEqual(htmlResult.skills[0].name, 'skill1');
assert_1.default.strictEqual(htmlResult.skills[0].repo, 'user/skill1');
assert_1.default.strictEqual(htmlResult.skills[1].installs, '1.2K');
assert_1.default.strictEqual(htmlResult.totalCount, 1234);
console.log('HTML Parsing Passed.');
console.log('All tests passed!');
//# sourceMappingURL=parser.test.js.map