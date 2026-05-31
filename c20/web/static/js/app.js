let performanceChart = null;
let comparisonChart = null;

const STORAGE_KEY = 'fpga_simulator_config';
const DEFAULT_CONFIG = {
    matrix_size: 8,
    num_layers: 3,
    batch_size: 1,
    use_relu: true,
    num_pe: 4,
    clock_freq_mhz: 100,
    data_width: 16,
    power_per_pe_mw: 100,
    memory_power_mw: 200,
    idle_power_mw: 50
};

function getConfig() {
    const config = {
        matrix_size: parseInt(document.getElementById('matrix_size').value),
        num_layers: parseInt(document.getElementById('num_layers').value),
        batch_size: parseInt(document.getElementById('batch_size').value),
        use_relu: document.getElementById('use_relu').checked,
        num_pe: parseInt(document.getElementById('num_pe').value),
        clock_freq_mhz: parseFloat(document.getElementById('clock_freq').value),
        data_width: parseInt(document.getElementById('data_width').value),
        power_per_pe_mw: parseFloat(document.getElementById('power_per_pe').value),
        memory_power_mw: parseFloat(document.getElementById('memory_power').value),
        idle_power_mw: parseFloat(document.getElementById('idle_power').value)
    };
    saveConfig(config);
    return config;
}

function saveConfig(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
        console.warn('无法保存配置到localStorage:', e);
    }
}

function loadConfig() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('无法从localStorage加载配置:', e);
    }
    return DEFAULT_CONFIG;
}

function applyConfig(config) {
    const elements = {
        'matrix_size': 'select',
        'num_layers': 'number',
        'batch_size': 'number',
        'use_relu': 'checkbox',
        'num_pe': 'select',
        'clock_freq_mhz': 'number',
        'data_width': 'select',
        'power_per_pe_mw': 'number',
        'memory_power_mw': 'number',
        'idle_power_mw': 'number'
    };
    
    for (const [key, type] of Object.entries(elements)) {
        const element = document.getElementById(key);
        if (element && config[key] !== undefined) {
            if (type === 'checkbox') {
                element.checked = config[key];
            } else {
                element.value = config[key];
            }
        }
    }
}

function setupConfigAutoSave() {
    const elements = [
        'matrix_size', 'num_layers', 'batch_size', 'use_relu',
        'num_pe', 'clock_freq_mhz', 'data_width',
        'power_per_pe_mw', 'memory_power_mw', 'idle_power_mw'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                getConfig();
            });
        }
    });
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('history-container').classList.add('hidden');
}

function showResults() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('results-container').classList.remove('hidden');
    document.getElementById('history-container').classList.add('hidden');
}

function showHistory() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('history-container').classList.remove('hidden');
}

function updateResults(result) {
    document.getElementById('speedup').textContent = result.speedup.toFixed(2) + 'x';
    document.getElementById('fpga-time').textContent = result.fpga_time_ms.toFixed(4) + ' ms';
    document.getElementById('cpu-time').textContent = result.cpu_time_ms.toFixed(4) + ' ms';
    document.getElementById('fpga-cycles').textContent = result.fpga_cycles.toLocaleString();
    document.getElementById('power').textContent = result.power_consumption_mw.toFixed(2) + ' mW';
    document.getElementById('energy').textContent = result.energy_uj.toFixed(2) + ' uJ';
    document.getElementById('throughput').textContent = result.throughput_mops.toFixed(2) + ' MOPS';
}

function createPerformanceChart(result) {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['FPGA时间', 'CPU时间'],
            datasets: [{
                label: '执行时间 (ms)',
                data: [result.fpga_time_ms, result.cpu_time_ms],
                backgroundColor: [
                    'rgba(0, 212, 255, 0.7)',
                    'rgba(244, 114, 182, 0.7)'
                ],
                borderColor: [
                    'rgba(0, 212, 255, 1)',
                    'rgba(244, 114, 182, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#cbd5e1'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

function createComparisonChart(comparisonData) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    const labels = comparisonData.map(item => item.num_pe + ' PE');
    const speedups = comparisonData.map(item => item.result.speedup);
    const powers = comparisonData.map(item => item.result.power_consumption_mw);
    
    comparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '加速比 (x)',
                    data: speedups,
                    borderColor: 'rgba(0, 212, 255, 1)',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: '功耗 (mW)',
                    data: powers,
                    borderColor: 'rgba(244, 114, 182, 1)',
                    backgroundColor: 'rgba(244, 114, 182, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#cbd5e1'
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '加速比',
                        color: '#00d4ff'
                    },
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: '功耗 (mW)',
                        color: '#f472b6'
                    },
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                },
                x: {
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

async function runSimulation() {
    showLoading();
    
    try {
        const config = getConfig();
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateResults(data.result);
            createPerformanceChart(data.result);
            showResults();
        } else {
            alert('仿真失败: ' + data.error);
            document.getElementById('loading').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('网络错误: ' + error.message);
        document.getElementById('loading').classList.add('hidden');
    }
}

async function runComparison() {
    showLoading();
    
    try {
        const config = getConfig();
        const response = await fetch('/api/compare', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (data.success) {
            createComparisonChart(data.comparison);
            
            const bestConfig = data.comparison.reduce((best, current) => 
                current.result.speedup > best.result.speedup ? current : best
            );
            updateResults(bestConfig.result);
            createPerformanceChart(bestConfig.result);
            
            showResults();
        } else {
            alert('对比失败: ' + data.error);
            document.getElementById('loading').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('网络错误: ' + error.message);
        document.getElementById('loading').classList.add('hidden');
    }
}

async function loadHistory() {
    showLoading();
    
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = '';
        
        if (data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">暂无历史记录</td></tr>';
        } else {
            data.history.forEach((item, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.network_config.matrix_size} x ${item.network_config.matrix_size}</td>
                    <td>${item.network_config.num_layers}</td>
                    <td>${item.fpga_config.num_pe}</td>
                    <td>${item.speedup.toFixed(2)}x</td>
                    <td>${item.power_consumption_mw.toFixed(2)}</td>
                    <td>${new Date(Date.now() - (data.history.length - 1 - index) * 60000).toLocaleTimeString()}</td>
                `;
                tbody.appendChild(row);
            });
        }
        
        showHistory();
    } catch (error) {
        console.error('Error:', error);
        alert('网络错误: ' + error.message);
        document.getElementById('loading').classList.add('hidden');
    }
}

async function runOptimization() {
    showLoading();
    
    try {
        const config = getConfig();
        const optimizationTarget = document.getElementById('optimization_target').value;
        
        const peOptions = document.getElementById('optimize_pe').checked ? [1, 2, 4, 8, 16] : [config.num_pe];
        const freqOptions = document.getElementById('optimize_freq').checked ? [50, 100, 150, 200, 250] : [config.clock_freq_mhz];
        const widthOptions = document.getElementById('optimize_width').checked ? [8, 16, 32] : [config.data_width];
        
        const requestData = {
            ...config,
            optimization_target: optimizationTarget,
            pe_options: peOptions,
            freq_options: freqOptions,
            width_options: widthOptions
        };
        
        const response = await fetch('/api/optimize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            const bestConfig = data.result.best_config;
            
            document.getElementById('num_pe').value = bestConfig.num_pe;
            document.getElementById('clock_freq').value = bestConfig.clock_freq_mhz;
            document.getElementById('data_width').value = bestConfig.data_width;
            
            saveConfig(getConfig());
            
            updateResults(data.result.best_result);
            createPerformanceChart(data.result.best_result);
            
            if (data.result.pareto_front && data.result.pareto_front.length > 0) {
                createOptimizationChart(data.result.pareto_front);
            }
            
            showResults();
            
            alert(`优化完成!\n\n最佳配置:\n- PE数量: ${bestConfig.num_pe}\n- 时钟频率: ${bestConfig.clock_freq_mhz} MHz\n- 数据位宽: ${bestConfig.data_width} bit\n\n搜索了 ${data.result.total_configurations} 种配置组合`);
        } else {
            alert('优化失败: ' + data.error);
            document.getElementById('loading').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('网络错误: ' + error.message);
        document.getElementById('loading').classList.add('hidden');
    }
}

function createOptimizationChart(paretoFront) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    const labels = paretoFront.map((item, index) => `${item.config.num_pe}PE\n${item.config.clock_freq_mhz}MHz`);
    const performances = paretoFront.map(item => item.performance);
    const powers = paretoFront.map(item => item.power);
    
    comparisonChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Pareto前沿 (性能-功耗)',
                data: paretoFront.map(item => ({
                    x: item.power,
                    y: item.performance,
                    r: 12
                })),
                backgroundColor: 'rgba(0, 212, 255, 0.7)',
                borderColor: 'rgba(0, 212, 255, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#cbd5e1'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = paretoFront[context.dataIndex];
                            return [
                                `PE: ${item.config.num_pe}`,
                                `频率: ${item.config.clock_freq_mhz} MHz`,
                                `位宽: ${item.config.data_width} bit`,
                                `加速比: ${item.performance.toFixed(2)}x`,
                                `功耗: ${item.power.toFixed(2)} mW`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: '加速比 (x)',
                        color: '#00d4ff'
                    },
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '功耗 (mW)',
                        color: '#f472b6'
                    },
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

async function exportProject() {
    const config = getConfig();
    
    const projectName = prompt('请输入项目名称:', 'fpga_nn_accelerator');
    if (!projectName) return;
    
    showLoading();
    
    try {
        const requestData = {
            ...config,
            project_name: projectName,
            fpga_part: 'xc7a35ticsg324-1L',
            target_family: 'Artix-7'
        };
        
        const response = await fetch('/api/export_project', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName}_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            alert('FPGA项目导出成功!\n\n项目包含:\n- 参数化Verilog源码\n- Vivado Tcl综合脚本\n- XDC约束文件\n- Makefile构建脚本\n- 完整的README文档\n\n请使用Vivado 2020.1或更高版本打开项目');
        } else {
            const data = await response.json();
            alert('导出失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('网络错误: ' + error.message);
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

async function exportConfig() {
    const config = getConfig();
    
    try {
        const response = await fetch('/api/export_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fpga_config_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('导出失败: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const savedConfig = loadConfig();
    applyConfig(savedConfig);
    setupConfigAutoSave();
});

document.getElementById('run-simulation').addEventListener('click', runSimulation);
document.getElementById('run-optimization').addEventListener('click', runOptimization);
document.getElementById('run-comparison').addEventListener('click', runComparison);
document.getElementById('export-project').addEventListener('click', exportProject);
document.getElementById('load-history').addEventListener('click', loadHistory);
