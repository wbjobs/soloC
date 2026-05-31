import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import * as d3 from 'd3';

let currentBook = null;
let currentSelection = null;

const COLORS = {
  BOOK: '#3B82F6',
  ANNOTATION: '#10B981',
  PERSON: '#EF4444',
  LOCATION: '#F59E0B',
  ORGANIZATION: '#8B5CF6',
  WORK_OF_ART: '#EC4899',
  DATE: '#06B6D4',
};

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadBooks();
});

function setupEventListeners() {
  document.getElementById('btn-import').addEventListener('click', handleImport);
  document.getElementById('btn-search').addEventListener('click', handleSearch);
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  document.getElementById('btn-export-jsonld').addEventListener('click', handleExportJsonld);
  document.getElementById('btn-refresh-graph').addEventListener('click', loadGraph);
  document.getElementById('btn-save-annotation').addEventListener('click', handleSaveAnnotation);
  document.getElementById('btn-cancel-annotation').addEventListener('click', () => {
    document.getElementById('annotation-modal').style.display = 'none';
  });
  
  document.getElementById('content-area').addEventListener('mouseup', (e) => {
    setTimeout(() => handleTextSelection(e), 10);
  });
  
  document.addEventListener('mousedown', (e) => {
    const tools = document.getElementById('highlight-tools');
    if (tools && !tools.contains(e.target) && !e.target.closest('#content-area')) {
      tools.style.display = 'none';
      window.getSelection().removeAllRanges();
      currentSelection = null;
    }
  });
  
  window.openAnnotationModal = openAnnotationModal;
  
  document.querySelectorAll('input[name="highlight-color"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (currentSelection) {
        applyHighlight();
      }
    });
  });
  
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });
  
  document.getElementById('btn-analyze-cross-book').addEventListener('click', analyzeCrossBook);
}

async function handleImport() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: '电子书',
        extensions: ['epub', 'pdf', 'mobi']
      }]
    });
    
    if (selected) {
      showStatus('正在导入文件...');
      const result = await invoke('import_file', { path: selected });
      
      if (result.success) {
        showStatus(result.message);
        await loadBooks();
      } else {
        showStatus('导入失败: ' + result.message);
      }
    }
  } catch (error) {
    showStatus('错误: ' + error);
  }
}

async function loadBooks() {
  try {
    const books = await invoke('list_books');
    const booksList = document.getElementById('books-list');
    booksList.innerHTML = '';
    
    books.forEach(book => {
      const li = document.createElement('li');
      li.className = 'book-item';
      li.innerHTML = `
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-meta">${escapeHtml(book.author)} · ${book.file_type.toUpperCase()}</div>
      `;
      li.addEventListener('click', () => openBook(book));
      booksList.appendChild(li);
    });
    
    await loadBookSelection();
  } catch (error) {
    console.error('加载书籍失败:', error);
  }
}

async function openBook(book) {
  currentBook = book;
  currentSelection = null;
  
  document.getElementById('book-title').textContent = book.title;
  document.getElementById('book-author').textContent = book.author;
  document.getElementById('content-area').innerHTML = formatContent(book.content);
  
  await loadAnnotations(book.id);
  document.getElementById('annotation-panel').style.display = 'block';
}

function formatContent(content) {
  return escapeHtml(content)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

async function loadAnnotations(bookId) {
  try {
    const annotations = await invoke('get_annotations', { bookId });
    const list = document.getElementById('annotations-list');
    list.innerHTML = '';
    
    annotations.forEach(ann => {
      const div = document.createElement('div');
      div.className = 'annotation-item';
      div.innerHTML = `
        <div class="annotation-text">${escapeHtml(ann.selected_text.substring(0, 100))}${ann.selected_text.length > 100 ? '...' : ''}</div>
        <div class="annotation-note">${escapeHtml(ann.note)}</div>
      `;
      list.appendChild(div);
    });
  } catch (error) {
    console.error('加载批注失败:', error);
  }
}

async function handleSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  
  try {
    showStatus('正在搜索...');
    const results = await invoke('search_text', { query });
    
    const resultsList = document.getElementById('search-results');
    resultsList.innerHTML = '';
    
    if (results.length === 0) {
      resultsList.innerHTML = '<li class="no-results">未找到匹配结果</li>';
      return;
    }
    
    results.forEach(result => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="result-book">${escapeHtml(result.book_title)}</div>
        <div class="result-matches">${result.matches.length} 个匹配</div>
      `;
      
      result.matches.forEach(match => {
        const contextDiv = document.createElement('div');
        contextDiv.className = 'result-context';
        contextDiv.textContent = '...' + match.context + '...';
        li.appendChild(contextDiv);
      });
      
      resultsList.appendChild(li);
    });
    
    showStatus('搜索完成');
  } catch (error) {
    showStatus('搜索错误: ' + error);
  }
}

function handleTextSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  
  if (!text) return;
  
  const contentArea = document.getElementById('content-area');
  const preSelectionRange = document.createRange();
  preSelectionRange.selectNodeContents(contentArea);
  preSelectionRange.setEnd(range.startContainer, range.startOffset);
  const startPos = preSelectionRange.toString().length;
  const endPos = startPos + text.length;
  
  currentSelection = {
    start: startPos,
    end: endPos,
    text: text,
    range: range
  };
  
  const tools = document.getElementById('highlight-tools');
  tools.style.display = 'flex';
  
  const rect = range.getBoundingClientRect();
  tools.style.top = Math.max(rect.top - 45, 60) + 'px';
  tools.style.left = Math.max(rect.left, 10) + 'px';
}

async function applyHighlight() {
  if (!currentSelection || !currentBook) return;
  
  const colorRadio = document.querySelector('input[name="highlight-color"]:checked');
  const color = colorRadio ? colorRadio.value : '#FFFF00';
  
  try {
    await invoke('add_highlight', {
      bookId: currentBook.id,
      startPos: currentSelection.start,
      endPos: currentSelection.end,
      text: currentSelection.text,
      color: color
    });
    
    const span = document.createElement('span');
    span.className = 'highlight';
    span.style.backgroundColor = color;
    currentSelection.range.surroundContents(span);
    
    document.getElementById('highlight-tools').style.display = 'none';
    window.getSelection().removeAllRanges();
  } catch (error) {
    showStatus('高亮失败: ' + error);
  }
}

function openAnnotationModal() {
  if (!currentSelection) return;
  
  document.getElementById('annotation-text').value = currentSelection.text;
  document.getElementById('annotation-note').value = '';
  document.getElementById('annotation-modal').style.display = 'flex';
}

async function handleSaveAnnotation() {
  if (!currentSelection || !currentBook) return;
  
  const note = document.getElementById('annotation-note').value.trim();
  if (!note) {
    showStatus('请输入批注内容');
    return;
  }
  
  try {
    await invoke('add_annotation', {
      bookId: currentBook.id,
      highlightId: null,
      startPos: currentSelection.start,
      endPos: currentSelection.end,
      selectedText: currentSelection.text,
      note: note
    });
    
    document.getElementById('annotation-modal').style.display = 'none';
    document.getElementById('highlight-tools').style.display = 'none';
    window.getSelection().removeAllRanges();
    
    await loadAnnotations(currentBook.id);
    showStatus('批注已保存');
  } catch (error) {
    showStatus('保存批注失败: ' + error);
  }
}

async function loadGraph() {
  try {
    showStatus('正在构建知识图谱...');
    const graph = await invoke('build_knowledge_graph');
    renderGraph(graph);
    showStatus('图谱构建完成');
  } catch (error) {
    showStatus('图谱构建失败: ' + error);
  }
}

function renderGraph(graph) {
  const container = document.getElementById('graph-container');
  container.innerHTML = '';
  
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  const svg = d3.select('#graph-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g');
  
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  
  svg.call(zoom);
  
  const simulation = d3.forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(40));
  
  const link = g.append('g')
    .selectAll('line')
    .data(graph.edges)
    .enter()
    .append('line')
    .attr('stroke', '#999')
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.6);
  
  const linkLabels = g.append('g')
    .selectAll('text')
    .data(graph.edges)
    .enter()
    .append('text')
    .text(d => d.relationship)
    .attr('font-size', '10px')
    .attr('fill', '#666')
    .attr('text-anchor', 'middle');
  
  const node = g.append('g')
    .selectAll('g')
    .data(graph.nodes)
    .enter()
    .append('g')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));
  
  node.append('circle')
    .attr('r', d => d.node_type === 'BOOK' ? 20 : d.node_type === 'ANNOTATION' ? 15 : 12)
    .attr('fill', d => COLORS[d.node_type] || '#888')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .on('click', (event, d) => showNodeInfo(d))
    .on('mouseover', function(event, d) {
      d3.select(this).attr('r', d => (d.node_type === 'BOOK' ? 25 : d.node_type === 'ANNOTATION' ? 20 : 15));
    })
    .on('mouseout', function(event, d) {
      d3.select(this).attr('r', d => (d.node_type === 'BOOK' ? 20 : d.node_type === 'ANNOTATION' ? 15 : 12));
    });
  
  node.append('text')
    .text(d => d.label.length > 15 ? d.label.substring(0, 15) + '...' : d.label)
    .attr('font-size', '11px')
    .attr('text-anchor', 'middle')
    .attr('dy', 30)
    .attr('pointer-events', 'none');
  
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    
    linkLabels
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2);
    
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
  
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  
  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
}

function showNodeInfo(node) {
  const panel = document.getElementById('node-info');
  const content = document.getElementById('node-info-content');
  
  let html = `<h4>${escapeHtml(node.label)}</h4>`;
  html += `<p><strong>类型:</strong> ${node.node_type}</p>`;
  
  if (node.data) {
    if (node.data.book_title) html += `<p><strong>书籍:</strong> ${escapeHtml(node.data.book_title)}</p>`;
    if (node.data.original_text) html += `<p><strong>原文片段:</strong> ${escapeHtml(node.data.original_text)}</p>`;
    if (node.data.note) html += `<p><strong>批注:</strong> ${escapeHtml(node.data.note)}</p>`;
    if (node.data.start_pos !== undefined && node.data.end_pos !== undefined) {
      html += `<p><strong>位置:</strong> ${node.data.start_pos} - ${node.data.end_pos}</p>`;
    }
  }
  
  content.innerHTML = html;
  panel.style.display = 'block';
}

async function handleExportJsonld() {
  try {
    const jsonld = await invoke('export_graph_jsonld');
    
    const path = await save({
      defaultPath: 'knowledge-graph.jsonld',
      filters: [{
        name: 'JSON-LD',
        extensions: ['jsonld', 'json']
      }]
    });
    
    if (path) {
      await writeTextFile(path, JSON.stringify(jsonld, null, 2));
      showStatus('图谱已导出为 JSON-LD');
    }
  } catch (error) {
    showStatus('导出失败: ' + error);
  }
}

function showStatus(message) {
  const status = document.getElementById('status-bar');
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = '就绪';
    }
  }, 3000);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) {
    activeTab.classList.add('active');
  }
}

let allBooks = [];
let selectedBookIds = [];
let currentCrossBookAnalysis = null;
let selectedEntityForTimeline = null;

async function loadBookSelection() {
  try {
    allBooks = await invoke('list_books');
    const container = document.getElementById('book-select-container');
    container.innerHTML = '';
    
    allBooks.forEach(book => {
      const div = document.createElement('div');
      div.className = 'book-checkbox';
      div.innerHTML = `
        <input type="checkbox" id="book-${book.id}" value="${book.id}">
        <label for="book-${book.id}">${escapeHtml(book.title)}</label>
      `;
      
      const checkbox = div.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedBookIds.push(book.id);
        } else {
          selectedBookIds = selectedBookIds.filter(id => id !== book.id);
        }
      });
      
      container.appendChild(div);
    });
  } catch (error) {
    console.error('加载书籍选择失败:', error);
  }
}

async function analyzeCrossBook() {
  try {
    showStatus('正在进行跨书籍分析...');
    
    const analysis = await invoke('analyze_cross_book', { bookIds: selectedBookIds });
    currentCrossBookAnalysis = analysis;
    
    renderMergedEntities(analysis.merged_entities);
    renderEntityRelations(analysis.co_occurrences);
    
    showStatus(`分析完成: ${analysis.total_entities} 个实体, ${analysis.total_annotations} 条批注`);
  } catch (error) {
    console.error('跨书籍分析失败:', error);
    showStatus('跨书籍分析失败: ' + error);
  }
}

function renderMergedEntities(entities) {
  const container = document.getElementById('merged-entities-list');
  
  if (!entities || entities.length === 0) {
    container.innerHTML = '<div class="no-data">暂无实体数据<br/>请先添加批注</div>';
    return;
  }
  
  container.innerHTML = entities.map(entity => `
    <div class="entity-item" data-name="${escapeHtml(entity.entity_name)}" data-type="${entity.entity_type}">
      <div class="entity-name">${escapeHtml(entity.entity_name)}</div>
      <div class="entity-meta">
        ${getEntityTypeLabel(entity.entity_type)} · ${entity.total_occurrences} 次 · ${entity.book_count} 本书
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.entity-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      
      const name = item.dataset.name;
      const type = item.dataset.type;
      loadEntityTimeline(name, type);
    });
  });
}

function renderEntityRelations(relations) {
  const container = document.getElementById('entity-relations-list');
  
  if (!relations || relations.length === 0) {
    container.innerHTML = '<div class="no-data">暂无实体关系</div>';
    return;
  }
  
  container.innerHTML = relations.slice(0, 20).map(relation => `
    <div class="relation-item">
      <div class="relation-entities">
        <span style="color: ${COLORS[relation.entity1_type] || '#888'}">${escapeHtml(relation.entity1)}</span>
        ↔
        <span style="color: ${COLORS[relation.entity2_type] || '#888'}">${escapeHtml(relation.entity2)}</span>
      </div>
      <div class="relation-strength">
        共现: ${relation.co_occurrence_count} 次 · ${relation.book_count} 本书
      </div>
      <div class="strength-bar">
        <div class="strength-fill" style="width: ${Math.min(100, relation.relationship_strength * 100)}%"></div>
      </div>
    </div>
  `).join('');
}

async function loadEntityTimeline(entityName, entityType) {
  try {
    const timeline = await invoke('get_entity_timeline_for_entity', {
      entityName: entityName,
      entityType: entityType
    });
    
    renderTimeline(timeline);
    selectedEntityForTimeline = { name: entityName, type: entityType };
  } catch (error) {
    console.error('加载时间线失败:', error);
  }
}

function renderTimeline(timeline) {
  const container = document.getElementById('entity-timeline');
  
  if (!timeline || timeline.length === 0) {
    container.innerHTML = '<div class="no-data">暂无时间线数据</div>';
    return;
  }
  
  container.innerHTML = timeline.map(entry => `
    <div class="timeline-item">
      <div class="timeline-time">${formatTimestamp(entry.timestamp)}</div>
      <div class="timeline-book">${escapeHtml(entry.book.title)}</div>
      <div class="timeline-note">${escapeHtml(entry.annotation.note)}</div>
      ${entry.related_entities && entry.related_entities.length > 0 ?
        `<div class="timeline-related">相关实体: ${entry.related_entities.slice(0, 3).map(e => escapeHtml(e)).join(', ')}</div>` :
        ''
      }
    </div>
  `).join('');
}

function getEntityTypeLabel(type) {
  const labels = {
    'PERSON': '人物',
    'LOCATION': '地点',
    'ORGANIZATION': '组织',
    'WORK_OF_ART': '作品',
    'DATE': '日期',
    'BOOK': '书籍',
    'ANNOTATION': '批注'
  };
  return labels[type] || type;
}

function formatTimestamp(ts) {
  try {
    const date = new Date(ts);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return ts;
  }
}

const originalOpenBook = openBook;
openBook = async function(book) {
  await originalOpenBook(book);
  await loadBookSelection();
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
