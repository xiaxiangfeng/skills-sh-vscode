<template>
  <div class="list-item">
    <div class="item-content">
      <div
        class="item-title"
        :class="{ 'title-link': titleClickable }"
        @click="handleTitleClick"
      >
        {{ title }}
      </div>
      <div class="item-subtitle">{{ subtitle }}</div>
      <div v-if="$slots.details" class="item-details">
        <slot name="details"></slot>
      </div>
    </div>
    <div class="item-actions">
      <span class="item-meta-top">{{ meta }}</span>
      <div class="item-buttons">
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    subtitle: string;
    meta: string;
    titleClickable?: boolean;
  }>(),
  {
    titleClickable: true
  }
);

const emit = defineEmits<{
  (e: 'click-title'): void;
}>();

function handleTitleClick() {
  if (!props.titleClickable) return;
  emit('click-title');
}
</script>

<style scoped>
/*
  Styles are currently global in styles.css.
  We can migrate them here later for better encapsulation,
  but for now we rely on the global styles to minimize regression risk.
*/
.item-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
