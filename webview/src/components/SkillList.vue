<template>
  <div class="skill-list-container">
    <!-- Flat List Mode -->
    <div v-if="items && items.length">
      <div v-if="header" class="marketplace-disclaimer">
        <span>{{ header }}</span>
      </div>
      <SkillItem
        v-for="(item, index) in items"
        :key="getItemKey(item)"
        v-bind="getItemProps(item, index)"
        @click-title="$emit('click-item', item)"
      >
        <template #actions>
          <slot name="actions" :item="item" :index="index"></slot>
        </template>
      </SkillItem>
    </div>

    <!-- Grouped List Mode -->
    <div v-else-if="groups && groups.length">
      <div v-for="group in groups" :key="group.key" class="installed-group">
        <div
          class="list-header"
          :class="{ collapsed: collapsed.has(group.key) }"
          @click="toggleGroup(group.key)"
        >
          <span class="arrow"></span>
          <span>{{ group.label }}</span>
          <span class="badge">{{ group.skills.length }}</span>
        </div>
        <div class="list-content" v-show="!collapsed.has(group.key)">
          <SkillItem
            v-for="(item, index) in group.skills"
            :key="getItemKey(item)"
            class="child-item"
            v-bind="getItemProps(item, index)"
            @click-title="$emit('click-item', item)"
          >
            <template #actions>
              <slot name="actions" :item="item" :index="index"></slot>
            </template>
          </SkillItem>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SkillItem from './SkillItem.vue';
import { MarketplaceSkill, InstalledSkill, ActiveTab } from '../types';

interface Group {
  key: string;
  label: string;
  skills: InstalledSkill[];
}

const props = defineProps<{
  items?: (MarketplaceSkill | InstalledSkill)[];
  groups?: Group[];
  header?: string;
  variant: 'marketplace' | 'installed';
  itemMapper?: (item: MarketplaceSkill | InstalledSkill, index: number) => { title: string; subtitle: string; meta: string };
}>();

defineEmits<{
  (e: 'click-item', item: MarketplaceSkill | InstalledSkill): void;
}>();

const collapsed = ref<Set<string>>(new Set());

function toggleGroup(key: string) {
  const next = new Set(collapsed.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsed.value = next;
}

function getItemKey(item: MarketplaceSkill | InstalledSkill): string {
  if ('repo' in item) {
    return `${item.repo}/${item.name}`;
  }
  return item.path;
}

function getItemProps(item: MarketplaceSkill | InstalledSkill, index: number) {
  if (props.itemMapper) {
    return props.itemMapper(item, index);
  }

  if (props.variant === 'marketplace') {
    const skill = item as MarketplaceSkill;
    return {
      title: skill.name,
      subtitle: skill.repo,
      meta: `#${index + 1} - ${skill.installs || 'N/A'}`
    };
  } else {
    const skill = item as InstalledSkill;
    return {
      title: skill.name,
      subtitle: skill.description || 'No description',
      meta: formatDate(skill.updatedAt)
    };
  }
}

function formatDate(value?: number) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}
</script>

<style scoped>
/* Scoped styles specific to the list structure if needed */
.skill-list-container {
  padding-bottom: 20px;
}
</style>
