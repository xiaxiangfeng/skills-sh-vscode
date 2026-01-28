export type SkillLevel = 'project' | 'user';
export type AgentType = string;

export interface AgentDefinition {
  name: string;
  displayName: string;
  skillsDir: string;
  globalSkillsDir?: string;
}

export type MarketplaceCategory = 'all' | 'trending' | 'hot';

export interface Skill {
  name: string;
  description: string;
  path: string;
  level: SkillLevel;
  agent: AgentType;
  agentLabel?: string;
  updatedAt?: number;
}

export interface MarketplaceSkill {
  name: string;
  repo: string;
  installs: string;
  url: string;
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
  installed: Skill[];
  marketplace: Record<MarketplaceCategory, MarketplaceCategoryState>;
  search: SearchState;
}
