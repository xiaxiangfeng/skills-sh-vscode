<template>
  <div class="search-box">
    <input
      ref="inputRef"
      :value="modelValue"
      @input="handleInput"
      @keydown="handleKeydown"
      type="text"
      placeholder="Search skills..."
    />
    <button class="search-button" @click="handleSubmit">Search</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'submit'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    emit('submit');
  }
}

function handleSubmit() {
  emit('submit');
}
</script>

<style scoped>
.search-box {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
  background-color: var(--vscode-editor-background);
  position: sticky;
  top: 0;
  z-index: 10;
}

.search-box input {
  flex: 1;
  padding: 6px 8px;
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  outline: none;
}

.search-button {
  padding: 6px 10px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  white-space: nowrap;
}

.search-button:hover {
  background: var(--vscode-button-hoverBackground);
}

.search-box input:focus {
  border-color: var(--vscode-focusBorder);
}

.search-box input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}
</style>
