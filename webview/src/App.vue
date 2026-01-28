<template>
  <div class="app">
    <div class="app-header">
      <div class="search-box">
        <input v-model="searchQuery" type="text" placeholder="Search skills..." />
      </div>
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
      <div v-else class="marketplace-list">
        <div class="marketplace-disclaimer">
          <span v-if="marketplaceView.header">{{ marketplaceView.header }} - </span>
          Data provided by <a href="#" class="disclaimer-link" @click.prevent="openUrl('https://skills.sh')">skills.sh</a>
        </div>
        <div
          v-for="(skill, index) in marketplaceView.items"
          :key="skill.repo + '/' + skill.name"
          class="list-item"
        >
          <div class="item-content">
            <div class="item-title title-link" @click="openUrl(getSkillUrl(skill))">{{ skill.name }}</div>
            <div class="item-subtitle">{{ skill.repo }}</div>
          </div>
          <div class="item-actions">
            <span class="item-meta-top">#{{ index + 1 }} - {{ skill.installs || 'N/A' }}</span>
            <button
              class="install-btn"
              :class="isInstalled(skill.name) ? 'secondary' : 'primary'"
              @click="installSkill(skill.repo, skill.name)"
            >
              {{ isInstalled(skill.name) ? 'Reinstall' : 'Install' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel" v-show="activeTab === 'installed'">
      <div class="toolbar">
        <label class="toolbar-label" for="installed-sort">Sort</label>
        <select id="installed-sort" v-model="installedSort">
          <option value="type">Type</option>
          <option value="time">Time</option>
        </select>
      </div>

      <div id="installed-list">
        <div v-if="installedEmptyMessage" class="empty-state">{{ installedEmptyMessage }}</div>

        <div v-else-if="installedSort === 'time'">
          <div v-for="skill in installedByTime" :key="skill.path" class="list-item">
            <div class="item-content">
              <div class="item-title title-link" @click="openSkill(skill.path)">{{ skill.name }}</div>
              <div class="item-subtitle">{{ buildInstalledSubtitle(skill) }}</div>
            </div>
            <div class="item-actions">
              <span class="item-meta-top">{{ formatDate(skill.updatedAt) }}</span>
              <div class="item-buttons">
                <button
                  v-if="getMarketplaceMatch(skill.name)"
                  class="secondary install-btn"
                  @click="installSkill(getMarketplaceMatch(skill.name)?.repo || '', skill.name)"
                >
                  Reinstall
                </button>
                <button class="secondary delete-btn" @click="deleteSkill(skill)">Remove</button>
              </div>
            </div>
          </div>
        </div>

        <div v-else>
          <div v-for="group in installedGroups" :key="group.key" class="installed-group">
            <div
              class="list-header"
              :class="{ collapsed: collapsedGroups.has(group.key) }"
              @click="toggleGroup(group.key)"
            >
              <span class="arrow"></span>
              <span>{{ group.label }}</span>
              <span class="badge">{{ group.skills.length }}</span>
            </div>
            <div class="list-content" v-show="!collapsedGroups.has(group.key)">
              <div v-for="skill in group.skills" :key="skill.path" class="list-item child-item">
                <div class="item-content">
                  <div class="item-title title-link" @click="openSkill(skill.path)">{{ skill.name }}</div>
                  <div class="item-subtitle">{{ skill.description || 'No description' }}</div>
                </div>
                <div class="item-actions">
                  <span class="item-meta-top">{{ formatDate(skill.updatedAt) }}</span>
                  <div class="item-buttons">
                    <button
                      v-if="getMarketplaceMatch(skill.name)"
                      class="secondary install-btn"
                      @click="installSkill(getMarketplaceMatch(skill.name)?.repo || '', skill.name)"
                    >
                      Reinstall
                    </button>
                    <button class="secondary delete-btn" @click="deleteSkill(skill)">Remove</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { vscode } from './vscode';
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
const searchQuery = ref<string>((persisted.searchQuery as string) || '');
const installedSort = ref<'type' | 'time'>((persisted.installedSort as 'type' | 'time') || 'type');

if (!['all', 'trending', 'hot', 'installed'].includes(activeTab.value)) {
  activeTab.value = 'all';
}
if (!['type', 'time'].includes(installedSort.value)) {
  installedSort.value = 'type';
}

const state = ref<WebviewState>(createEmptyState());
const collapsedGroups = ref<Set<string>>(new Set());
let searchTimer: number | undefined;

const agentDefinitions = computed<AgentDefinition[]>(() => state.value.agents || []);
const agentLabelMap = computed(() => {
  const map = new Map<string, string>();
  agentDefinitions.value.forEach((agent) => {
    map.set(agent.name, agent.displayName);
  });
  return map;
});

const tabs = computed(() => {
  const counts = {
    all: formatCount(state.value.marketplace.all.totalCount ?? state.value.marketplace.all.skills.length),
    trending: formatCount(state.value.marketplace.trending.skills.length),
    hot: formatCount(state.value.marketplace.hot.skills.length),
    installed: formatCount(state.value.installed.length)
  };

  return [
    { key: 'all' as ActiveTab, label: 'All Time', count: counts.all },
    { key: 'trending' as ActiveTab, label: 'Trending (24h)', count: counts.trending },
    { key: 'hot' as ActiveTab, label: 'Hot', count: counts.hot },
    { key: 'installed' as ActiveTab, label: 'Installed', count: counts.installed }
  ];
});

const installedNames = computed(() => new Set(state.value.installed.map((skill) => skill.name)));

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

const filteredInstalled = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [...state.value.installed];
  return state.value.installed.filter((skill) =>
    (skill.name || '').toLowerCase().includes(query) ||
    (skill.description || '').toLowerCase().includes(query)
  );
});

const installedByTime = computed(() => {
  return [...filteredInstalled.value].sort((a, b) => {
    const at = a.updatedAt || 0;
    const bt = b.updatedAt || 0;
    if (bt !== at) return bt - at;
    return String(a.name).localeCompare(String(b.name));
  });
});

const installedGroups = computed(() => {
  const grouped: Record<string, InstalledSkill[]> = {};
  filteredInstalled.value.forEach((skill) => {
    const key = `${skill.level}|${skill.agent}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(skill);
  });

  const groups: Array<{ key: string; label: string; skills: InstalledSkill[] }> = [];
  const orderedKeys = new Set<string>();

  (['project', 'user'] as const).forEach((level) => {
    agentDefinitions.value.forEach((agent) => {
      const key = `${level}|${agent.name}`;
      const skills = grouped[key];
      if (!skills || skills.length === 0) return;
      const sorted = [...skills].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      groups.push({
        key,
        label: `${level === 'project' ? 'Project' : 'User'} / ${agent.displayName}`,
        skills: sorted
      });
      orderedKeys.add(key);
    });
  });

  Object.entries(grouped).forEach(([key, skills]) => {
    if (orderedKeys.has(key) || skills.length === 0) return;
    const sample = skills[0];
    const agentLabel = getAgentLabel(sample.agent, sample.agentLabel);
    const levelLabel = sample.level === 'project' ? 'Project' : 'User';
    const sorted = [...skills].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    groups.push({ key, label: `${levelLabel} / ${agentLabel}`, skills: sorted });
  });

  return groups;
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
    searchQuery: searchQuery.value,
    installedSort: installedSort.value
  });
}

function setActiveTab(tab: ActiveTab) {
  activeTab.value = tab;
}

function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsedGroups.value = next;
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

function formatDate(value?: number) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}

function buildInstalledSubtitle(skill: InstalledSkill) {
  const parts = [skill.description || 'No description', getTypeLabel(skill)];
  return parts.filter(Boolean).join(' - ');
}

function getTypeLabel(skill: InstalledSkill) {
  const levelLabel = skill.level === 'project' ? 'Project' : 'User';
  const agentLabel = getAgentLabel(skill.agent, skill.agentLabel);
  return `${levelLabel} / ${agentLabel}`;
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

function deleteSkill(skill: InstalledSkill) {
  vscode.postMessage({ command: 'deleteSkill', path: skill.path, name: skill.name });
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

watch(activeTab, (value) => {
  persistState();
  if (value !== 'installed') {
    vscode.postMessage({ command: 'setCategory', category: value });
  }
});

watch(installedSort, () => {
  persistState();
});

watch(searchQuery, (value) => {
  persistState();

  if (searchTimer) {
    window.clearTimeout(searchTimer);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    vscode.postMessage({ command: 'search', query: '' });
    return;
  }

  searchTimer = window.setTimeout(() => {
    vscode.postMessage({ command: 'search', query: trimmed });
  }, 250);
});

onMounted(() => {
  window.addEventListener('message', handleMessage);
  if (activeTab.value !== 'installed') {
    vscode.postMessage({ command: 'setCategory', category: activeTab.value });
  }
  if (searchQuery.value.trim()) {
    vscode.postMessage({ command: 'search', query: searchQuery.value.trim() });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage);
});
</script>
