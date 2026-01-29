<template>
  <div class="search-box">
    <input
      ref="inputRef"
      :value="modelValue"
      @input="handleInput"
      type="text"
      placeholder="Search skills..."
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}
</script>

<style scoped>
.search-box {
  padding: 10px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
  background-color: var(--vscode-editor-background);
  position: sticky;
  top: 0;
  z-index: 10;
}

.search-box input {
  width: 100%;
  padding: 6px 8px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  outline: none;
}

.search-box input:focus {
  border-color: var(--vscode-focusBorder);
}

.search-box input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}
</style>
