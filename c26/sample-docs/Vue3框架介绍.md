# Vue3 框架介绍

Vue 3 是渐进式 JavaScript 框架的最新版本。

## 核心特性

- Composition API
- 更好的 TypeScript 支持
- 更快的渲染速度

## 组合式 API 示例

```typescript
import { ref, computed } from 'vue'

const count = ref(0)
const double = computed(() => count.value * 2)
```

## 相关链接

- [[Rust编程基础]]
- [[Tauri应用开发]]
