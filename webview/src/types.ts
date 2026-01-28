export type MarketplaceCategory = 'all' | 'trending' | 'hot';
export type ActiveTab = MarketplaceCategory | 'installed';

export type SkillLevel = 'project' | 'user';
export type AgentType = string;

export interface AgentDefinition {
  name: string;
  displayName: string;
  skillsDir: string;
  globalSkillsDir?: string;
}

export interface MarketplaceSkill {
  name: string;
  repo: string;
  installs: string;
  url: string;
}

export interface InstalledSkill {
  name: string;
  description: string;
  path: string;
  level: SkillLevel;
  agent: AgentType;
  agentLabel?: string;
  updatedAt?: number;
}

export interface MarketplaceCategoryState {
  skills: MarketplaceSkill[];
  totalCount?: number;
  isLoading: boolean;
  error: string | null;
}

export interface SearchState {
  query: string;
  results: MarketplaceSkill[];
  isLoading: boolean;
  error: string | null;
}

export interface WebviewState {
  agents: AgentDefinition[];
  installed: InstalledSkill[];
  marketplace: Record<MarketplaceCategory, MarketplaceCategoryState>;
  search: SearchState;
}

export function createEmptyState(): WebviewState {
  return {
    agents: [],
    installed: [],
    marketplace: {
      all: { skills: [], totalCount: undefined, isLoading: false, error: null },
      trending: { skills: [], totalCount: undefined, isLoading: false, error: null },
      hot: { skills: [], totalCount: undefined, isLoading: false, error: null }
    },
    search: { query: '', results: [], isLoading: false, error: null }
  };
}
