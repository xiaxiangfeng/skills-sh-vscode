<template>
  <div class="app">
    <div class="app-header">
      <SearchBar v-model="searchInput" @submit="submitSearch" />
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="setActiveTab(tab.key)"
        >
          <span class="tab-label">{{ tab.label }}</span>
          <span v-if="tab.count" class="tab-count">{{ tab.count }}</span>
        </button>
      </div>
    </div>

    <!-- Marketplace Panels -->
    <div class="panel" v-show="activeTab !== 'installed'">
      <div v-if="marketplaceView.mode === 'loading'" class="loading">
        {{ marketplaceView.message }}
      </div>
      <div v-else-if="marketplaceView.mode === 'error'" class="empty-state">
        {{ marketplaceView.message }}
        <br /><br />
        <a href="#" class="retry-link" @click.prevent="handleRetry(marketplaceView.retry)">Try again</a>
      </div>
      <div v-else-if="marketplaceView.mode === 'empty'" class="empty-state">
        {{ marketplaceView.message }}
      </div>
      
      <SkillList
        v-else
        :items="marketplaceView.items"
        :header="marketplaceView.header"
        variant="marketplace"
        @click-item="onMarketplaceItemClick"
      >
        <template #actions="{ item }">
          <button
            class="install-btn"
            :class="getMarketplaceButtonClass(item)"
            @click.stop="installSkill(item.repo, item.name)"
          >
            {{ getMarketplaceButtonLabel(item) }}
          </button>
        </template>
      </SkillList>
    </div>

    <!-- Installed Panel -->
    <div class="panel" v-show="activeTab === 'installed'">
      <div class="toolbar">
        <label class="toolbar-label" for="installed-sort">Sort</label>
        <select id="installed-sort" v-model="installedSort">
          <option value="time">Install Time</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div class="installed-hint">
        Universal agents: {{ universalAgentsText }}
      </div>
      <div v-if="updatesCount" class="update-banner">
        <span>{{ updatesCount }} update(s) available</span>
        <button class="primary install-btn" @click.stop="updateAll">Update all</button>
      </div>

      <div id="installed-list">
        <div v-if="installedEmptyMessage" class="empty-state">{{ installedEmptyMessage }}</div>

        <SkillList
          v-else
          :items="installedItems"
          variant="installed"
          :itemMapper="installedItemMapper"
          @click-item="onInstalledItemClick"
        >
          <template #details="{ item }">
            <div class="installed-agent-list">
              <button
                v-for="entry in getInstalledAgentEntries(item)"
                :key="entry.key"
                class="agent-chip"
                @click.stop="openAgentSkill(entry.path)"
                :title="`Open ${entry.label} SKILL.md`"
              >
                {{ entry.label }}
              </button>
            </div>
          </template>
          <template #actions="{ item }">
            <button
              v-if="getReinstallPayload(item)"
              class="secondary install-btn"
              @click.stop="reinstallSkill(item)"
            >
              Reinstall
            </button>
            <button class="secondary delete-btn" @click.stop="deleteSkill(item)">Remove</button>
          </template>
        </SkillList>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { vscode } from './vscode';
import SearchBar from './components/SearchBar.vue';
import SkillList from './components/SkillList.vue';
import {
  ActiveTab,
  AgentDefinition,
  MarketplaceCategory,
  MarketplaceSkill,
  WebviewState,
  createEmptyState,
  InstalledSkill
} from './types';

const persisted = vscode.getState() || {};

const activeTab = ref<ActiveTab>((persisted.activeTab as ActiveTab) || 'all');
const searchInput = ref<string>((persisted.searchInput as string) || (persisted.searchQuery as string) || '');
const searchQuery = ref<string>((persisted.searchQuery as string) || '');
const installedSort = ref<'time' | 'name'>((persisted.installedSort as 'time' | 'name') || 'time');

if (!['all', 'trending', 'hot', 'installed'].includes(activeTab.value)) {
  activeTab.value = 'all';
}
if (!['time', 'name'].includes(installedSort.value)) {
  installedSort.value = 'time';
}

const state = ref<WebviewState>(createEmptyState());

const agentDefinitions = computed<AgentDefinition[]>(() => state.value.agents || []);
const agentLabelMap = computed(() => {
  const map = new Map<string, string>();
  agentDefinitions.value.forEach((agent) => {
    map.set(agent.name, agent.displayName);
  });
  return map;
});

function isUniversalAgentDefinition(agent: AgentDefinition) {
  return agent.skillsDir.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase() === '.agents/skills';
}

const universalAgentsText = computed(() => {
  const names = agentDefinitions.value
    .filter((agent) => isUniversalAgentDefinition(agent))
    .map((agent) => agent.displayName)
    .sort((a, b) => a.localeCompare(b));

  return names.length > 0 ? names.join(', ') : 'None';
});

const installedCount = computed(() => filteredInstalled.value.length);

const tabs = computed(() => {
  const counts = {
    all: formatCount(state.value.marketplace.all.totalCount ?? state.value.marketplace.all.skills.length),
    trending: formatCount(state.value.marketplace.trending.skills.length),
    hot: formatCount(state.value.marketplace.hot.skills.length),
    installed: formatCount(installedCount.value)
  };

  return [
    { key: 'all' as ActiveTab, label: 'All Time', count: counts.all },
    { key: 'trending' as ActiveTab, label: 'Trending (24h)', count: counts.trending },
    { key: 'hot' as ActiveTab, label: 'Hot', count: counts.hot },
    { key: 'installed' as ActiveTab, label: 'Installed', count: counts.installed }
  ];
});

const installedNames = computed(() => new Set(state.value.installed.map((skill) => skill.name)));
const updateAvailableNames = computed(() => new Set(Object.keys(state.value.updates || {})));
const updatesCount = computed(() => updateAvailableNames.value.size);

const updatesIndex = computed(() => new Map<string, MarketplaceSkill>(Object.entries(state.value.updates || {})));

const marketplaceIndex = computed(() => {
  const index = new Map<string, MarketplaceSkill>();
  (['all', 'trending', 'hot'] as MarketplaceCategory[]).forEach((key) => {
    state.value.marketplace[key].skills.forEach((skill) => {
      if (!index.has(skill.name)) {
        index.set(skill.name, skill);
      }
    });
  });
  state.value.search.results.forEach((skill) => {
    if (!index.has(skill.name)) {
      index.set(skill.name, skill);
    }
  });
  return index;
});

type InstalledListItem = InstalledSkill & {
  installedAgentEntries: InstalledAgentEntry[];
  installedAgents: string[];
  installedAgentKeys: string[];
};

type InstalledAgentEntry = {
  key: string;
  label: string;
  path: string;
};

const mergedInstalled = computed<InstalledListItem[]>(() => {
  const map = new Map<string, InstalledListItem>();

  state.value.installed.forEach((skill) => {
    const key = (skill.name || '').toLowerCase();
    const agentLabel = skill.isUniversal
      ? 'Universal (.agents/skills)'
      : getAgentLabel(skill.agent, skill.agentLabel);
    const agentKey = `${skill.level}:${skill.agent}`;

    if (!map.has(key)) {
      map.set(key, {
        ...skill,
        installedAgentEntries: [{ key: agentKey, label: agentLabel, path: skill.path }],
        installedAgents: [agentLabel],
        installedAgentKeys: [agentKey]
      });
      return;
    }

    const current = map.get(key)!;
    if (skill.description && !current.description) {
      current.description = skill.description;
    }

    const currentUpdatedAt = current.updatedAt || 0;
    const nextUpdatedAt = skill.updatedAt || 0;
    if (nextUpdatedAt > currentUpdatedAt) {
      current.updatedAt = skill.updatedAt;
      current.path = skill.path;
      current.source = skill.source || current.source;
      current.sourceUrl = skill.sourceUrl || current.sourceUrl;
    }

    if (!current.installedAgentKeys.includes(agentKey)) {
      current.installedAgentKeys.push(agentKey);
      current.installedAgents.push(agentLabel);
      current.installedAgentEntries.push({
        key: agentKey,
        label: agentLabel,
        path: skill.path
      });
    }
  });

  return [...map.values()].map((item) => ({
    ...item,
    installedAgentEntries: [...item.installedAgentEntries].sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    installedAgents: [...item.installedAgents].sort((a, b) => a.localeCompare(b))
  }));
});

const filteredInstalled = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [...mergedInstalled.value];
  return mergedInstalled.value.filter((skill) =>
    (skill.name || '').toLowerCase().includes(query) ||
    (skill.description || '').toLowerCase().includes(query) ||
    skill.installedAgents.some((agent) => agent.toLowerCase().includes(query))
  );
});

const installedItems = computed(() => {
  const list = [...filteredInstalled.value];
  if (installedSort.value === 'name') {
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  return list.sort((a, b) => {
    const at = a.updatedAt || 0;
    const bt = b.updatedAt || 0;
    if (bt !== at) return bt - at;
    return String(a.name).localeCompare(String(b.name));
  });
});

const installedEmptyMessage = computed(() => {
  if (filteredInstalled.value.length > 0) return '';
  return searchQuery.value.trim() ? 'No matching skills found.' : 'No skills installed.';
});

type MarketplaceView =
  | { mode: 'loading'; message: string }
  | { mode: 'error'; message: string; retry: 'search' | 'marketplace' }
  | { mode: 'empty'; message: string }
  | { mode: 'list'; items: MarketplaceSkill[]; header?: string };

const marketplaceView = computed<MarketplaceView>(() => {
  if (activeTab.value === 'installed') {
    return { mode: 'empty', message: '' };
  }

  const query = searchQuery.value.trim();
  if (query) {
    const search = state.value.search;
    if (search.query && search.query !== query) {
      return { mode: 'loading', message: 'Searching...' };
    }
    if (search.isLoading) {
      return { mode: 'loading', message: 'Searching...' };
    }
    if (search.error) {
      return { mode: 'error', message: search.error, retry: 'search' };
    }
    if (search.results.length === 0) {
      return { mode: 'empty', message: 'No matching skills found.' };
    }
    return {
      mode: 'list',
      items: search.results,
      header: `Search results for "${query}"`
    };
  }

  const category = state.value.marketplace[activeTab.value as MarketplaceCategory];
  if (category.isLoading) {
    return { mode: 'loading', message: 'Loading skills...' };
  }
  if (category.error) {
    return { mode: 'error', message: category.error, retry: 'marketplace' };
  }
  if (category.skills.length === 0) {
    return { mode: 'empty', message: 'No skills available.' };
  }

  return { mode: 'list', items: category.skills };
});

function persistState() {
  vscode.setState({
    activeTab: activeTab.value,
    searchInput: searchInput.value,
    searchQuery: searchQuery.value,
    installedSort: installedSort.value
  });
}

function setActiveTab(tab: ActiveTab) {
  activeTab.value = tab;
  if (tab === 'installed' && (searchInput.value.trim() || searchQuery.value.trim())) {
    searchInput.value = '';
    searchQuery.value = '';
    vscode.postMessage({ command: 'search', query: '' });
  }
}

function formatCount(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getMarketplaceMatch(name: string) {
  return marketplaceIndex.value.get(name);
}

function getReinstallPayload(skill: InstalledListItem): { repo: string; skill?: string } | undefined {
  const market = getMarketplaceMatch(skill.name);
  if (market?.repo) {
    return { repo: market.repo, skill: skill.name };
  }

  const source = skill.sourceUrl || skill.source;
  if (!source) return undefined;

  if (isDirectSkillUrl(source)) {
    return { repo: source };
  }

  return { repo: source, skill: skill.name };
}

function isDirectSkillUrl(value: string): boolean {
  if (!value.startsWith('http://') && !value.startsWith('https://')) return false;
  return value.toLowerCase().endsWith('/skill.md');
}

function reinstallSkill(skill: InstalledListItem) {
  const payload = getReinstallPayload(skill);
  if (!payload) return;
  installSkill(payload.repo, payload.skill);
}

function isUpdateAvailable(skill: InstalledListItem): boolean {
  if (updatesIndex.value.has(skill.name)) {
    return true;
  }
  const market = getMarketplaceMatch(skill.name);
  if (!market?.updatedAt || !skill.updatedAt) {
    return false;
  }
  return market.updatedAt > skill.updatedAt;
}

function getMarketplaceButtonLabel(skill: MarketplaceSkill): string {
  if (!isInstalled(skill.name)) {
    return 'Install';
  }
  return 'Reinstall';
}

function getMarketplaceButtonClass(skill: MarketplaceSkill): string {
  if (!isInstalled(skill.name)) {
    return 'primary';
  }
  return 'secondary';
}

function formatDate(value?: number) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}

function buildInstalledSubtitle(skill: InstalledListItem) {
  return skill.description || 'No description';
}

function getAgentLabel(agent: string, fallback?: string) {
  return agentLabelMap.value.get(agent) || fallback || agent;
}

function getSkillUrl(skill: MarketplaceSkill) {
  return skill.url || `https://skills.sh/${skill.repo}/${skill.name}`;
}

function isInstalled(name: string) {
  return installedNames.value.has(name);
}

function installSkill(repo: string, skill?: string) {
  if (!repo) return;
  vscode.postMessage({ command: 'install', repo, skill });
}

function openSkill(path: string) {
  vscode.postMessage({ command: 'openSkill', path });
}

function openUrl(url: string) {
  vscode.postMessage({ command: 'openUrl', url });
}

function openAgentSkill(path: string) {
  if (!path) return;
  vscode.postMessage({ command: 'openSkill', path });
}

function getInstalledAgentEntries(item: MarketplaceSkill | InstalledListItem): InstalledAgentEntry[] {
  const skill = item as InstalledListItem;
  return skill.installedAgentEntries || [];
}

function deleteSkill(skill: InstalledListItem) {
  vscode.postMessage({ command: 'deleteSkill', path: skill.path, name: skill.name });
}

function updateAll() {
  vscode.postMessage({ command: 'updateAll' });
}

function handleRetry(type: 'search' | 'marketplace') {
  if (type === 'search') {
    vscode.postMessage({ command: 'search', query: searchQuery.value });
  } else {
    vscode.postMessage({ command: 'refresh' });
  }
}

function handleMessage(event: MessageEvent) {
  if (event.data?.command === 'state') {
    state.value = event.data.payload as WebviewState;
  }
}

function onMarketplaceItemClick(item: any) { // using any for convenience as item type is known in context
    const skill = item as MarketplaceSkill;
    openUrl(getSkillUrl(skill));
}

function onInstalledItemClick(item: any) {
    const skill = item as InstalledListItem;
    openSkill(skill.path);
}

// Mapper for SkillList to render installed items correctly
function installedItemMapper(item: MarketplaceSkill | InstalledListItem) {
  const skill = item as InstalledListItem;
  const metaParts = [formatDate(skill.updatedAt)];
  if (isUpdateAvailable(skill)) {
    metaParts.push('Update available');
  }
  return {
    title: skill.name,
    subtitle: buildInstalledSubtitle(skill),
    meta: metaParts.filter(Boolean).join(' - '),
    titleClickable: false
  };
}

function submitSearch() {
  const trimmed = searchInput.value.trim();
  searchQuery.value = trimmed;
  vscode.postMessage({ command: 'search', query: trimmed });
}

watch(activeTab, (value) => {
  persistState();
  if (value !== 'installed') {
    vscode.postMessage({ command: 'setCategory', category: value });
  }
});

watch(installedSort, () => {
  persistState();
});

watch(searchQuery, () => {
  persistState();
});

watch(searchInput, (value) => {
  persistState();
  if (!value.trim() && searchQuery.value) {
    searchQuery.value = '';
    vscode.postMessage({ command: 'search', query: '' });
  }
});

onMounted(() => {
  window.addEventListener('message', handleMessage);
  if (activeTab.value !== 'installed') {
    vscode.postMessage({ command: 'setCategory', category: activeTab.value });
  }
  if (searchQuery.value.trim()) {
    vscode.postMessage({ command: 'search', query: searchQuery.value.trim() });
  } else if (searchInput.value.trim()) {
    searchQuery.value = searchInput.value.trim();
    vscode.postMessage({ command: 'search', query: searchQuery.value });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage);
});
</script>

