let ladderData = {
    rungs: [
        { elements: [] }
    ],
    version: "1.0"
};

let selectedElement = null;
let currentEditingElement = null;
let rungCount = 1;
let elementCount = 0;

const elementTypes = {
    'contact-no': {
        name: '常开触点',
        type: 'contact',
        subtype: 'no',
        opcode: 0x01,
        createHtml: (address, id) => `
            <div class="element contact-element" draggable="true" data-id="${id}" data-type="contact-no" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <span class="contact-label">${address || 'I0.0'}</span>
            </div>
        `
    },
    'contact-nc': {
        name: '常闭触点',
        type: 'contact',
        subtype: 'nc',
        opcode: 0x02,
        createHtml: (address, id) => `
            <div class="element contact-element nc" draggable="true" data-id="${id}" data-type="contact-nc" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <span class="contact-label">${address || 'I0.1'}</span>
            </div>
        `
    },
    'coil': {
        name: '输出线圈',
        type: 'coil',
        subtype: 'normal',
        opcode: 0x03,
        createHtml: (address, id) => `
            <div class="element coil-element" draggable="true" data-id="${id}" data-type="coil" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <span class="coil-label">${address || 'Q0.0'}</span>
            </div>
        `
    },
    'coil-not': {
        name: '取反线圈',
        type: 'coil',
        subtype: 'negated',
        opcode: 0x04,
        createHtml: (address, id) => `
            <div class="element coil-element negated" draggable="true" data-id="${id}" data-type="coil-not" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <span class="coil-label">${address || 'Q0.1'}</span>
            </div>
        `
    },
    'timer-on': {
        name: '接通定时器',
        type: 'timer',
        subtype: 'on',
        opcode: 0x05,
        createHtml: (address, id, preset) => `
            <div class="element timer-element" draggable="true" data-id="${id}" data-type="timer-on" data-preset="${preset || 1000}" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <span class="timer-label">TON</span>
                <span class="timer-value">${address || 'T0'}</span>
            </div>
        `
    },
    'counter': {
        name: '加计数器',
        type: 'counter',
        subtype: 'up',
        opcode: 0x06,
        createHtml: (address, id, preset) => `
            <div class="element counter-element" draggable="true" data-id="${id}" data-type="counter" data-preset="${preset || 100}" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <span class="counter-label">CTU</span>
                <span class="counter-value">${address || 'C0'}</span>
            </div>
        `
    },
    'parallel': {
        name: '并联分支',
        type: 'logic',
        subtype: 'parallel',
        opcode: 0x07,
        createHtml: (address, id) => `
            <div class="element parallel-branch" data-id="${id}" data-type="parallel" ondblclick="editElement('${id}')">
                <button class="element-delete" onclick="deleteElement(event, '${id}')">×</button>
                <div class="parallel-line">
                    <div class="drop-zone" data-position="0">分支1</div>
                </div>
                <div class="parallel-line">
                    <div class="drop-zone" data-position="1">分支2</div>
                </div>
            </div>
        `
    }
};

const templates = {
    'self-latch': {
        name: '自锁电路',
        rungs: [
            {
                elements: [
                    { type: 'contact-no', address: 'I0.0' },
                    { type: 'contact-nc', address: 'I0.1' },
                    { type: 'contact-no', address: 'Q0.0' },
                    { type: 'coil', address: 'Q0.0' }
                ]
            }
        ]
    },
    'interlock': {
        name: '互锁电路',
        rungs: [
            {
                elements: [
                    { type: 'contact-no', address: 'I0.0' },
                    { type: 'contact-nc', address: 'Q0.1' },
                    { type: 'coil', address: 'Q0.0' }
                ]
            },
            {
                elements: [
                    { type: 'contact-no', address: 'I0.1' },
                    { type: 'contact-nc', address: 'Q0.0' },
                    { type: 'coil', address: 'Q0.1' }
                ]
            }
        ]
    },
    'star-delta': {
        name: '星三角启动',
        rungs: [
            {
                elements: [
                    { type: 'contact-no', address: 'I0.0' },
                    { type: 'contact-nc', address: 'I0.1' },
                    { type: 'timer-on', address: 'T0', preset: 3000 },
                    { type: 'coil', address: 'Q0.0' }
                ]
            },
            {
                elements: [
                    { type: 'contact-no', address: 'Q0.0' },
                    { type: 'contact-nc', address: 'Q0.2' },
                    { type: 'coil', address: 'Q0.1' }
                ]
            },
            {
                elements: [
                    { type: 'contact-no', address: 'T0' },
                    { type: 'contact-nc', address: 'Q0.1' },
                    { type: 'coil', address: 'Q0.2' }
                ]
            }
        ]
    }
};

function generateId() {
    return 'el_' + Math.random().toString(36).substr(2, 9);
}

function addStatus(message, type = 'info') {
    const statusContent = document.getElementById('statusContent');
    const time = new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = `status-item ${type}`;
    item.textContent = `[${time}] ${message}`;
    statusContent.insertBefore(item, statusContent.firstChild);
    
    while (statusContent.children.length > 20) {
        statusContent.removeChild(statusContent.lastChild);
    }
}

function updateCounts() {
    document.getElementById('rungCount').textContent = rungCount;
    document.getElementById('elementCount').textContent = elementCount;
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    event.target.classList.add('drag-over');
}

function handleDrop(event, rungIndex, position) {
    event.preventDefault();
    event.target.classList.remove('drag-over');
    
    const elementType = event.dataTransfer.getData('text/plain');
    if (!elementType || !elementTypes[elementType]) {
        addStatus('无效的元件类型', 'error');
        return;
    }
    
    addElementToRung(rungIndex, position, elementType);
}

function addElementToRung(rungIndex, position, elementType, address = null, preset = null) {
    const rung = document.querySelector(`.rung[data-rung="${rungIndex}"]`);
    if (!rung) {
        addStatus(`梯级 ${rungIndex} 不存在`, 'error');
        return;
    }
    
    const id = generateId();
    const typeConfig = elementTypes[elementType];
    const html = typeConfig.createHtml(address, id);
    
    const dropZone = rung.querySelector('.drop-zone');
    if (dropZone) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const elementDiv = tempDiv.firstElementChild;
        
        dropZone.parentNode.insertBefore(elementDiv, dropZone);
        
        if (!ladderData.rungs[rungIndex]) {
            ladderData.rungs[rungIndex] = { elements: [] };
        }
        ladderData.rungs[rungIndex].elements.push({
            id: id,
            type: elementType,
            address: address || getDefaultAddress(elementType),
            preset: preset || getDefaultPreset(elementType)
        });
        
        elementCount++;
        updateCounts();
        addStatus(`添加元件: ${typeConfig.name} (${id})`, 'success');
        setupElementDrag(elementDiv);
    }
}

function getDefaultAddress(type) {
    switch(type) {
        case 'contact-no':
        case 'contact-nc':
            return 'I0.0';
        case 'coil':
        case 'coil-not':
            return 'Q0.0';
        case 'timer-on':
            return 'T0';
        case 'counter':
            return 'C0';
        default:
            return 'M0.0';
    }
}

function getDefaultPreset(type) {
    switch(type) {
        case 'timer-on':
            return 1000;
        case 'counter':
            return 100;
        default:
            return 0;
    }
}

function setupElementDrag(element) {
    element.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', element.dataset.type);
        e.dataTransfer.effectAllowed = 'move';
        selectedElement = element;
    });
    
    element.addEventListener('click', (e) => {
        document.querySelectorAll('.element').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        selectedElement = element;
    });
}

document.querySelectorAll('.component-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
    });
});

function addRung() {
    const canvas = document.getElementById('ladderCanvas');
    const addBtn = canvas.querySelector('.add-rung-btn');
    
    const newRung = document.createElement('div');
    newRung.className = 'rung';
    newRung.dataset.rung = rungCount;
    newRung.innerHTML = `
        <span class="rung-number">${rungCount}</span>
        <div class="rung-connector"></div>
        <div class="drop-zone" data-position="0" ondragover="handleDragOver(event)" ondrop="handleDrop(event, ${rungCount}, 0)">
            拖放元件到此处
        </div>
    `;
    
    canvas.insertBefore(newRung, addBtn);
    ladderData.rungs.push({ elements: [] });
    rungCount++;
    updateCounts();
    addStatus(`添加梯级: ${rungCount - 1}`, 'success');
}

function removeSelectedRung() {
    const rungs = document.querySelectorAll('.rung');
    if (rungs.length <= 1) {
        addStatus('至少需要保留一个梯级', 'error');
        return;
    }
    
    const lastRung = rungs[rungs.length - 1];
    lastRung.remove();
    ladderData.rungs.pop();
    rungCount--;
    updateCounts();
    addStatus(`删除梯级: ${rungs.length - 1}`, 'success');
}

function deleteElement(event, id) {
    event.stopPropagation();
    const element = document.querySelector(`[data-id="${id}"]`);
    if (element) {
        element.remove();
        elementCount = Math.max(0, elementCount - 1);
        updateCounts();
        
        for (let rung of ladderData.rungs) {
            rung.elements = rung.elements.filter(el => el.id !== id);
        }
        
        addStatus(`删除元件: ${id}`, 'success');
    }
}

function editElement(id) {
    const element = document.querySelector(`[data-id="${id}"]`);
    if (!element) return;
    
    currentEditingElement = { id, element };
    
    const type = element.dataset.type;
    const typeConfig = elementTypes[type];
    
    document.getElementById('modalType').value = typeConfig.name;
    
    let address = '';
    if (type.startsWith('contact')) {
        address = element.querySelector('.contact-label')?.textContent || '';
    } else if (type.startsWith('coil')) {
        address = element.querySelector('.coil-label')?.textContent || '';
    } else if (type === 'timer-on') {
        address = element.querySelector('.timer-value')?.textContent || '';
    } else if (type === 'counter') {
        address = element.querySelector('.counter-value')?.textContent || '';
    }
    
    document.getElementById('modalAddress').value = address;
    
    const timerSettings = document.getElementById('timerSettings');
    if (type === 'timer-on' || type === 'counter') {
        timerSettings.style.display = 'block';
        document.getElementById('modalPreset').value = element.dataset.preset || getDefaultPreset(type);
    } else {
        timerSettings.style.display = 'none';
    }
    
    document.getElementById('elementModal').classList.add('active');
}

function closeModal() {
    document.getElementById('elementModal').classList.remove('active');
    currentEditingElement = null;
}

function saveElement() {
    if (!currentEditingElement) return;
    
    const { id, element } = currentEditingElement;
    const address = document.getElementById('modalAddress').value;
    const preset = document.getElementById('modalPreset')?.value || 0;
    
    const type = element.dataset.type;
    
    if (type.startsWith('contact')) {
        const label = element.querySelector('.contact-label');
        if (label) label.textContent = address;
    } else if (type.startsWith('coil')) {
        const label = element.querySelector('.coil-label');
        if (label) label.textContent = address;
    } else if (type === 'timer-on') {
        const value = element.querySelector('.timer-value');
        if (value) value.textContent = address;
        element.dataset.preset = preset;
    } else if (type === 'counter') {
        const value = element.querySelector('.counter-value');
        if (value) value.textContent = address;
        element.dataset.preset = preset;
    }
    
    for (let rung of ladderData.rungs) {
        const el = rung.elements.find(e => e.id === id);
        if (el) {
            el.address = address;
            el.preset = parseInt(preset);
        }
    }
    
    closeModal();
    addStatus(`更新元件: ${address}`, 'success');
}

function loadTemplate(templateName) {
    const template = templates[templateName];
    if (!template) {
        addStatus('模板不存在', 'error');
        return;
    }
    
    clearLadder(false);
    
    while (rungCount < template.rungs.length) {
        addRung();
    }
    
    template.rungs.forEach((rung, rungIndex) => {
        rung.elements.forEach(element => {
            addElementToRung(rungIndex, 0, element.type, element.address, element.preset);
        });
    });
    
    addStatus(`加载模板: ${template.name}`, 'success');
}

function clearLadder(confirm = true) {
    if (confirm && !window.confirm('确定要清空所有梯级和元件吗？')) {
        return;
    }
    
    const canvas = document.getElementById('ladderCanvas');
    const rungs = canvas.querySelectorAll('.rung');
    const addBtn = canvas.querySelector('.add-rung-btn');
    
    rungs.forEach((rung, index) => {
        if (index > 0) {
            rung.remove();
        } else {
            const elements = rung.querySelectorAll('.element');
            elements.forEach(el => el.remove());
        }
    });
    
    ladderData = {
        rungs: [{ elements: [] }],
        version: "1.0"
    };
    
    rungCount = 1;
    elementCount = 0;
    updateCounts();
    
    if (confirm) {
        addStatus('已清空所有元件', 'success');
    }
}

async function compileLadder() {
    addStatus('开始编译梯形图...', 'info');
    
    try {
        const response = await fetch('/api/ladder/compile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(ladderData),
        });
        
        const result = await response.json();
        
        if (result.success) {
            addStatus(`编译成功: ${result.count} 条指令`, 'success');
        } else {
            addStatus('编译完成，但存在警告', 'info');
        }
        
        return result.instructions || [];
    } catch (error) {
        addStatus(`编译失败: ${error.message}`, 'error');
        return [];
    }
}

async function downloadBinary() {
    addStatus('正在生成二进制文件...', 'info');
    
    try {
        const response = await fetch('/api/ladder/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(ladderData),
        });
        
        if (!response.ok) {
            throw new Error('下载请求失败');
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ladder_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.plp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        addStatus(`已下载二进制文件: ${blob.size} 字节`, 'success');
    } catch (error) {
        addStatus(`下载失败: ${error.message}`, 'error');
    }
}

let zoomLevel = 1;

function zoomIn() {
    zoomLevel = Math.min(zoomLevel + 0.1, 2);
    document.getElementById('ladderCanvas').style.transform = `scale(${zoomLevel})`;
}

function zoomOut() {
    zoomLevel = Math.max(zoomLevel - 0.1, 0.5);
    document.getElementById('ladderCanvas').style.transform = `scale(${zoomLevel})`;
}

document.addEventListener('DOMContentLoaded', () => {
    addStatus('梯形图编辑器已就绪', 'success');
    
    document.getElementById('elementModal').addEventListener('click', (e) => {
        if (e.target.id === 'elementModal') {
            closeModal();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
        if (e.key === 'Delete' && selectedElement) {
            const id = selectedElement.dataset.id;
            deleteElement(e, id);
        }
    });
});
