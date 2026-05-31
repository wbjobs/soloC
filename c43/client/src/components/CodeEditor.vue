<template>
  <div ref="editorContainer" class="editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';

const props = defineProps<{
  code: string;
  language?: string;
}>();

const emit = defineEmits<{
  (e: 'codeChange', code: string): void;
  (e: 'operation', operation: { type: 'insert' | 'delete'; position: number; content?: string; length?: number }): void;
}>();

const editorContainer = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let isApplyingRemoteChange = false;

onMounted(() => {
  if (editorContainer.value) {
    editor = monaco.editor.create(editorContainer.value, {
      value: props.code,
      language: props.language || 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: 2
    });

    editor.onDidChangeModelContent((event) => {
      if (isApplyingRemoteChange) return;
      
      const model = editor?.getModel();
      if (!model) return;

      event.changes.forEach((change) => {
        const position = model.getOffsetAt(change.range.getStartPosition());
        
        if (change.text.length > 0) {
          for (let i = 0; i < change.text.length; i++) {
            emit('operation', {
              type: 'insert',
              position: position + i,
              content: change.text[i]
            });
          }
        }
        
        if (change.rangeLength > 0) {
          emit('operation', {
            type: 'delete',
            position: position,
            length: change.rangeLength
          });
        }
      });

      const newCode = model.getValue();
      emit('codeChange', newCode);
    });
  }
});

watch(() => props.code, (newCode) => {
  if (editor && editor.getValue() !== newCode) {
    isApplyingRemoteChange = true;
    const position = editor.getPosition();
    editor.setValue(newCode);
    if (position) {
      editor.setPosition(position);
    }
    setTimeout(() => {
      isApplyingRemoteChange = false;
    }, 50);
  }
});

function applyRemoteChange(code: string) {
  if (editor) {
    isApplyingRemoteChange = true;
    const position = editor.getPosition();
    editor.setValue(code);
    if (position) {
      editor.setPosition(position);
    }
    setTimeout(() => {
      isApplyingRemoteChange = false;
    }, 50);
  }
}

defineExpose({
  applyRemoteChange
});

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose();
  }
});
</script>

<style scoped>
.editor-container {
  width: 100%;
  height: 100%;
}
</style>
