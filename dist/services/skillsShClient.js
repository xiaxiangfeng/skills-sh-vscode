"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillsShClient = void 0;
const marketplaceParser_1 = require("./marketplaceParser");
class SkillsShClient {
    parser = new marketplaceParser_1.MarketplaceParser();
    async fetchCategory(category) {
        const url = this.getCategoryUrl(category);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'skills-sh-vscode/0.1.0',
                Accept: 'text/html,application/xhtml+xml,application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        return this.parser.parseResponse(text, category);
    }
    async search(query) {
        const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}&limit=50`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'skills-sh-vscode/0.1.0',
                Accept: 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            return this.parser.parseSkillsFromJson(data);
        }
        catch {
            return [];
        }
    }
    getCategoryUrl(category) {
        switch (category) {
            case 'trending':
                return 'https://skills.sh/trending';
            case 'hot':
                return 'https://skills.sh/hot';
            case 'all':
            default:
                return 'https://skills.sh/';
        }
    }
}
exports.SkillsShClient = SkillsShClient;
//# sourceMappingURL=skillsShClient.js.map