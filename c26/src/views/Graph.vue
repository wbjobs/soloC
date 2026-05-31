<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useKnowledgeStore } from '@/stores/knowledge'
import { VNetworkGraph, type Node, type Edge } from 'v-network-graph'
import 'v-network-graph/lib/style.css'

const store = useKnowledgeStore()
const router = useRouter()

const nodes = ref<Record<string, Node>>({})
const edges = ref<Record<string, Edge>>({})

const layouts = {
  force: {
    enabled: true,
    refresh: true,
    preventOverlap: true,
    nodeSpacing: 50,
    forceStrength: 0.05,
    center: { x: 0.5, y: 0.5 },
  }
}

const configs = {
  node: {
    selectable: true,
    label: {
      visible: true,
      fontSize: 12,
      color: '#334155',
    },
    normal: {
      radius: 20,
      stroke: {
        width: 2,
        color: '#3b82f6',
      },
      color: '#eff6ff',
    },
    hover: {
      radius: 24,
      stroke: {
        width: 2,
        color: '#2563eb',
      },
      color: '#dbeafe',
    },
    selected: {
      radius: 24,
      stroke: {
        width: 3,
        color: '#1d4ed8',
      },
      color: '#bfdbfe',
    },
  },
  edge: {
    normal: {
      width: 2,
      color: '#cbd5e1',
    },
    hover: {
      width: 3,
      color: '#94a3b8',
    },
    selected: {
      width: 3,
      color: '#3b82f6',
    },
  },
  view: {
    autoPanAndZoomOnLoad: 'fit-contain',
    layoutHandler: 'svg',
  },
}

onMounted(async () => {
  await store.buildGraph()
  updateGraph()
})

const updateGraph = () => {
  const nodeMap: Record<string, Node> = {}
  store.nodes.forEach(node => {
    nodeMap[node.id] = {
      name: node.name.replace('.md', ''),
    }
  })
  nodes.value = nodeMap

  const edgeMap: Record<string, Edge> = {}
  store.links.forEach((link, index) => {
    edgeMap[`edge-${index}`] = {
      source: link.source,
      target: link.target,
    }
  })
  edges.value = edgeMap
}

const onNodeClick = (nodeId: string) => {
  const node = store.nodes.find(n => n.id === nodeId)
  if (node) {
    router.push(`/editor/${encodeURIComponent(node.path)}`)
  }
}
</script>

<template>
  <div class="graph">
    <header class="graph-header">
      <button class="back-btn" @click="router.push('/')">← 返回</button>
      <h1>知识图谱</h1>
      <div class="stats">
        节点: {{ Object.keys(nodes).length }} | 链接: {{ Object.keys(edges).length }}
      </div>
    </header>

    <div class="graph-content">
      <VNetworkGraph
        :nodes="nodes"
        :edges="edges"
        :layouts="layouts"
        :configs="configs"
        @node:click="onNodeClick"
      />
    </div>

    <div class="graph-legend">
      <div class="legend-item">
        <span class="legend-node"></span>
        <span>Markdown 文件</span>
      </div>
      <div class="legend-item">
        <span class="legend-edge"></span>
        <span>双向链接关系</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.graph-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
}

.back-btn:hover {
  background: #e2e8f0;
}

.graph-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.stats {
  margin-left: auto;
  font-size: 14px;
  color: #64748b;
}

.graph-content {
  flex: 1;
  overflow: hidden;
}

.graph-legend {
  position: absolute;
  bottom: 24px;
  right: 24px;
  background: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}

.legend-node {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #eff6ff;
  border: 2px solid #3b82f6;
}

.legend-edge {
  width: 24px;
  height: 2px;
  background: #cbd5e1;
}
</style>
