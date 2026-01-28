import { MarketplaceCategory, MarketplaceSkill } from '../types';

interface MarketplaceParseResult {
  skills: MarketplaceSkill[];
  totalCount?: number;
}

export class SkillsShClient {
  async fetchCategory(category: MarketplaceCategory): Promise<MarketplaceParseResult> {
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
    return this.parseMarketplaceResponse(text, category);
  }

  async search(query: string): Promise<MarketplaceSkill[]> {
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
      return this.parseSkillsFromJson(data);
    } catch {
      return [];
    }
  }

  private getCategoryUrl(category: MarketplaceCategory): string {
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

  private parseMarketplaceResponse(response: string, category: MarketplaceCategory): MarketplaceParseResult {
    const trimmed = response.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const data = JSON.parse(trimmed);
        return {
          skills: this.parseSkillsFromJson(data),
          totalCount: this.parseTotalCountFromJson(data, category)
        };
      } catch {
        return { skills: [] };
      }
    }

    const skills = this.parseSkillsFromHtml(response);
    return {
      skills,
      totalCount: this.parseTotalCountFromHtml(response, category)
    };
  }

  private parseSkillsFromJson(data: any): MarketplaceSkill[] {
    const items = this.extractItemsFromJson(data);
    const skills: MarketplaceSkill[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const name = item.skill || item.skillName || item.name || item.slug || item.id;
      let repo =
        item.repo ||
        item.repository ||
        item.repoName ||
        item.fullName ||
        item.full_name ||
        item.topSource ||
        item.top_source ||
        item.source;

      if (!repo) {
        const owner = item.owner || item.org || item.organization;
        const repoName = item.repoName || item.repositoryName || item.repo || item.project;
        if (owner && repoName) {
          repo = `${owner}/${repoName}`;
        }
      }

      if (!name || !repo) {
        continue;
      }

      const installs = this.formatInstalls(
        item.installs || item.installCount || item.installs_count || item.count || item.downloads
      );

      const url = item.url || `https://skills.sh/${repo}/${name}`;
      const key = `${repo}/${name}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      skills.push({
        name: String(name),
        repo: String(repo),
        installs,
        url: String(url)
      });
    }

    return skills;
  }

  private extractItemsFromJson(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;

    const candidates = [data.skills, data.results, data.items, data.data, data.matches];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  private parseSkillsFromHtml(html: string): MarketplaceSkill[] {
    const skills: MarketplaceSkill[] = [];
    const seen = new Set<string>();

    const linkPattern =
      /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p[^>]*>([^<]+)<\/p>[\s\S]*?([0-9,.]+K?)\s*<\/[^>]*>[\s\S]*?<\/a>/g;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const path = match[1];
      const name = match[2].trim();
      const repo = match[3].trim();
      const installs = match[4].trim();
      const url = path.startsWith('http') ? path : `https://skills.sh${path}`;
      const key = `${repo}/${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        skills.push({ name, repo, installs, url });
      }
    }

    if (skills.length === 0) {
      const urlPattern = /https:\/\/skills\.sh\/([^/\s"')]+)\/([^/\s"')]+)\/([^/\s"')]+)/g;
      while ((match = urlPattern.exec(html)) !== null) {
        const owner = decodeURIComponent(match[1]);
        const repoName = decodeURIComponent(match[2]);
        const skillName = decodeURIComponent(match[3]);

        if (
          owner === 'agents' ||
          owner === 'docs' ||
          owner === 'trending' ||
          owner === 'hot' ||
          owner === 'search'
        ) {
          continue;
        }

        const repo = `${owner}/${repoName}`;
        const key = `${repo}/${skillName}`;
        if (!seen.has(key)) {
          seen.add(key);
          skills.push({
            name: skillName,
            repo,
            installs: 'N/A',
            url: `https://skills.sh/${owner}/${repoName}/${skillName}`
          });
        }
      }
    }

    if (skills.length === 0) {
      const markdownPattern = /###\s+([^\n]+)\n([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\n([0-9,.]+K?)/g;
      while ((match = markdownPattern.exec(html)) !== null) {
        const name = match[1].trim();
        const repo = match[2].trim();
        const installs = match[3].trim();
        const key = `${repo}/${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          skills.push({
            name,
            repo,
            installs,
            url: `https://skills.sh/${repo}/${name}`
          });
        }
      }
    }

    return skills;
  }

  private parseTotalCountFromJson(data: any, category: MarketplaceCategory): number | undefined {
    if (category !== 'all') return undefined;

    const raw = data?.total || data?.count || data?.totalCount || data?.stats?.total;
    if (typeof raw === 'number') {
      return raw;
    }

    if (typeof raw === 'string') {
      const digits = raw.replace(/[^0-9]/g, '');
      const parsed = Number(digits);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private parseTotalCountFromHtml(html: string, category: MarketplaceCategory): number | undefined {
    if (category !== 'all') return undefined;

    const match = html.match(/All Time\s*\(([^)]+)\)/i);
    if (!match) return undefined;

    const digits = match[1].replace(/[^0-9]/g, '');
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private formatInstalls(value: unknown): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value >= 1000) {
        const rounded = Math.round((value / 1000) * 10) / 10;
        return `${rounded}K`;
      }
      return String(Math.round(value));
    }

    return 'N/A';
  }
}
