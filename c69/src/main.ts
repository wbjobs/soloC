import { GRID_SIZE, GRID_VOLUME, HISTOGRAM_BINS, CameraState, SimulationParams, mat4 } from './types';
import { OrbitControls } from './OrbitControls';

const PARTICLE_SIZE = 6 * 4;

class GeneticParticleSystem {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private presentationFormat!: GPUTextureFormat;

  private gridBuffers!: { current: GPUBuffer; next: GPUBuffer };
  private lifePipeline!: GPUComputePipeline;
  private lifeBindGroups!: { read: GPUBindGroup; write: GPUBindGroup };
  private evolutionPipeline!: GPUComputePipeline;
  private evolutionBindGroup!: GPUBindGroup;
  private histogramPipeline!: GPUComputePipeline;
  private histogramBindGroup!: GPUBindGroup;
  private histogramBuffers!: {
    hue: GPUBuffer;
    birth: GPUBuffer;
    survive: GPUBuffer;
    age: GPUBuffer;
  };
  private histogramReadbackBuffers!: {
    hue: GPUBuffer;
    birth: GPUBuffer;
    survive: GPUBuffer;
    age: GPUBuffer;
  };

  private renderPipeline!: GPURenderPipeline;
  private renderBindGroup!: GPUBindGroup;
  private uniformBuffer!: GPUBuffer;
  private depthTexture!: GPUTexture;

  private camera: CameraState = {
    theta: Math.PI / 4,
    phi: Math.PI / 3,
    radius: 80,
    target: { x: 0, y: 0, z: 0 }
  };

  private params: SimulationParams = {
    birthThreshold: 4,
    surviveMin: 2,
    surviveMax: 5,
    mutationRate: 0.1,
    selectionPressure: 0.5
  };

  private isPaused = false;
  private updateSpeed = 100;
  private lastUpdateTime = 0;
  private controls!: OrbitControls;
  private viewProjDirty = true;
  
  private generation = 1;
  private frameCount = 0;
  private aliveCount = 0;
  private totalAge = 0;

  constructor(private canvas: HTMLCanvasElement) {}

  async init() {
    const entry = navigator.gpu;
    if (!entry) {
      throw new Error('WebGPU is not supported in this browser.');
    }

    const adapter = await entry.requestAdapter({
      powerPreference: 'high-performance'
    }).catch(() => null);
    
    if (!adapter) {
      const fallbackAdapter = await entry.requestAdapter();
      if (!fallbackAdapter) {
        throw new Error('Failed to get GPU adapter.');
      }
      this.device = await fallbackAdapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: 2 ** 28,
          maxBufferSize: 2 ** 28,
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 8,
          maxComputeWorkgroupSizeZ: 8,
          maxComputeWorkgroupsPerDimension: 8192
        }
      });
    } else {
      this.device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: 2 ** 28,
          maxBufferSize: 2 ** 28
        }
      });
    }

    this.context = this.canvas.getContext('webgpu')!;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: 'premultiplied'
    });

    await this.createBuffers();
    await this.createShaders();
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    this.setupUI();
    this.controls = new OrbitControls(this.canvas, this.camera, () => {
      this.viewProjDirty = true;
    });

    this.randomizeGrid();
    this.initHistogramBars();
    this.animate();
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.viewProjDirty = true;
    
    if (this.depthTexture) {
      this.depthTexture.destroy();
    }
    
    this.depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
  }

  private async createBuffers() {
    const gridSize = GRID_VOLUME * PARTICLE_SIZE;
    
    this.gridBuffers = {
      current: this.device.createBuffer({
        size: gridSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      }),
      next: this.device.createBuffer({
        size: gridSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      })
    };

    const histogramSize = HISTOGRAM_BINS * 4;
    this.histogramBuffers = {
      hue: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      }),
      birth: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      }),
      survive: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      }),
      age: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      })
    };

    this.histogramReadbackBuffers = {
      hue: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      }),
      birth: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      }),
      survive: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      }),
      age: this.device.createBuffer({
        size: histogramSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
      })
    };

    this.uniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  private async createShaders() {
    const lifeShaderCode = await fetch('src/shaders/particle_life.wgsl').then(r => r.text());
    const evolutionShaderCode = await fetch('src/shaders/evolution.wgsl').then(r => r.text());
    const histogramShaderCode = await fetch('src/shaders/histogram.wgsl').then(r => r.text());
    const renderShaderCode = await fetch('src/shaders/render.wgsl').then(r => r.text());

    const lifeShaderModule = this.device.createShaderModule({ code: lifeShaderCode });
    const evolutionShaderModule = this.device.createShaderModule({ code: evolutionShaderCode });
    const histogramShaderModule = this.device.createShaderModule({ code: histogramShaderCode });
    const renderShaderModule = this.device.createShaderModule({ code: renderShaderCode });

    const lifeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
      ]
    });

    this.lifePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [lifeBindGroupLayout]
      }),
      compute: { module: lifeShaderModule, entryPoint: 'main' }
    });

    const evolutionBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
      ]
    });

    this.evolutionPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [evolutionBindGroupLayout]
      }),
      compute: { module: evolutionShaderModule, entryPoint: 'main' }
    });

    const histogramBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
      ]
    });

    this.histogramPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [histogramBindGroupLayout]
      }),
      compute: { module: histogramShaderModule, entryPoint: 'main' }
    });

    this.createLifeBindGroups();
    this.createEvolutionBindGroup();
    this.createHistogramBindGroup();

    const renderBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }
      ]
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [renderBindGroupLayout]
      }),
      vertex: { module: renderShaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: renderShaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.presentationFormat }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'greater',
        format: 'depth32float'
      }
    });

    this.createRenderBindGroup();
  }

  private createLifeBindGroups() {
    const layout = this.lifePipeline.getBindGroupLayout(0);
    const uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    const data = new Float32Array([this.params.birthThreshold, this.params.surviveMin, this.params.surviveMax, 0]);
    this.device.queue.writeBuffer(uniformBuffer, 0, data);
    
    this.lifeBindGroups = {
      read: this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.gridBuffers.current } },
          { binding: 1, resource: { buffer: this.gridBuffers.next } },
          { binding: 2, resource: { buffer: uniformBuffer } }
        ]
      }),
      write: this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.gridBuffers.next } },
          { binding: 1, resource: { buffer: this.gridBuffers.current } },
          { binding: 2, resource: { buffer: uniformBuffer } }
        ]
      })
    };
  }

  private createEvolutionBindGroup() {
    const layout = this.evolutionPipeline.getBindGroupLayout(0);
    const uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    const data = new Float32Array([this.params.mutationRate, this.params.selectionPressure, this.generation, 0]);
    this.device.queue.writeBuffer(uniformBuffer, 0, data);
    
    this.evolutionBindGroup = this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.gridBuffers.current } },
        { binding: 1, resource: { buffer: uniformBuffer } }
      ]
    });
  }

  private createHistogramBindGroup() {
    const layout = this.histogramPipeline.getBindGroupLayout(0);
    this.histogramBindGroup = this.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.gridBuffers.current } },
        { binding: 1, resource: { buffer: this.histogramBuffers.hue } },
        { binding: 2, resource: { buffer: this.histogramBuffers.birth } },
        { binding: 3, resource: { buffer: this.histogramBuffers.survive } },
        { binding: 4, resource: { buffer: this.histogramBuffers.age } }
      ]
    });
  }

  private createRenderBindGroup() {
    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.gridBuffers.current } }
      ]
    });
  }

  private setupUI() {
    const birthSlider = document.getElementById('birth-threshold') as HTMLInputElement;
    const surviveMinSlider = document.getElementById('survive-min') as HTMLInputElement;
    const surviveMaxSlider = document.getElementById('survive-max') as HTMLInputElement;
    const speedSlider = document.getElementById('update-speed') as HTMLInputElement;
    const mutationSlider = document.getElementById('mutation-rate') as HTMLInputElement;
    const selectionSlider = document.getElementById('selection-pressure') as HTMLInputElement;
    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
    const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    const randomBtn = document.getElementById('random-btn') as HTMLButtonElement;
    const evolveBtn = document.getElementById('evolve-btn') as HTMLButtonElement;

    const updateParams = () => {
      this.params.birthThreshold = parseInt(birthSlider.value);
      this.params.surviveMin = parseInt(surviveMinSlider.value);
      this.params.surviveMax = parseInt(surviveMaxSlider.value);
      this.updateSpeed = parseInt(speedSlider.value);
      this.params.mutationRate = parseFloat(mutationSlider.value);
      this.params.selectionPressure = parseFloat(selectionSlider.value);

      (document.getElementById('birth-value') as HTMLElement).textContent = birthSlider.value;
      (document.getElementById('survive-min-value') as HTMLElement).textContent = surviveMinSlider.value;
      (document.getElementById('survive-max-value') as HTMLElement).textContent = surviveMaxSlider.value;
      (document.getElementById('speed-value') as HTMLElement).textContent = speedSlider.value;
      (document.getElementById('mutation-value') as HTMLElement).textContent = mutationSlider.value;
      (document.getElementById('selection-value') as HTMLElement).textContent = selectionSlider.value;
      
      this.createLifeBindGroups();
      this.createEvolutionBindGroup();
    };

    birthSlider.addEventListener('input', updateParams);
    surviveMinSlider.addEventListener('input', updateParams);
    surviveMaxSlider.addEventListener('input', updateParams);
    speedSlider.addEventListener('input', updateParams);
    mutationSlider.addEventListener('input', updateParams);
    selectionSlider.addEventListener('input', updateParams);

    pauseBtn.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      pauseBtn.textContent = this.isPaused ? '继续' : '暂停';
      pauseBtn.classList.toggle('paused', this.isPaused);
    });

    resetBtn.addEventListener('click', () => this.resetGrid());
    randomBtn.addEventListener('click', () => this.randomizeGrid());
    evolveBtn.addEventListener('click', () => this.triggerEvolution());
  }

  private initHistogramBars() {
    const containers = ['hue-histogram', 'birth-histogram', 'survive-histogram', 'age-histogram'];
    for (const containerId of containers) {
      const container = document.getElementById(containerId)!;
      container.innerHTML = '';
      for (let i = 0; i < HISTOGRAM_BINS; i++) {
        const bar = document.createElement('div');
        bar.className = 'histogram-bar';
        bar.style.height = '2px';
        container.appendChild(bar);
      }
    }
  }

  private resetGrid() {
    const data = new Uint32Array(GRID_VOLUME * 6);
    for (let i = 0; i < GRID_VOLUME; i++) {
      const base = i * 6;
      data[base] = 0;
      data[base + 1] = 0;
    }
    this.device.queue.writeBuffer(this.gridBuffers.current, 0, data);
    this.generation = 1;
    this.updateGenerationDisplay();
  }

  private randomizeGrid() {
    const data = new Float32Array(GRID_VOLUME * 6);
    for (let i = 0; i < GRID_VOLUME; i++) {
      const base = i * 6;
      if (Math.random() < 0.25) {
        data[base] = 1;
        data[base + 1] = Math.floor(Math.random() * 50);
        data[base + 2] = Math.random() * 360;
        data[base + 3] = 0.6 + Math.random() * 0.4;
        data[base + 4] = (Math.random() - 0.5) * 2;
        data[base + 5] = (Math.random() - 0.5) * 2;
      } else {
        data[base] = 0;
        data[base + 1] = 0;
        data[base + 2] = 180;
        data[base + 3] = 0.7;
        data[base + 4] = 0;
        data[base + 5] = 0;
      }
    }
    this.device.queue.writeBuffer(this.gridBuffers.current, 0, data);
    this.generation = 1;
    this.updateGenerationDisplay();
  }

  private triggerEvolution() {
    this.generation++;
    this.createEvolutionBindGroup();
    const commandEncoder = this.device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.evolutionPipeline);
    pass.setBindGroup(0, this.evolutionBindGroup);
    pass.dispatchWorkgroups(Math.ceil(GRID_VOLUME / 64), 1, 1);
    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);
    this.updateGenerationDisplay();
  }

  private updateGenerationDisplay() {
    (document.getElementById('generation-count') as HTMLElement).textContent = this.generation.toString();
  }

  private updateUniforms() {
    if (!this.viewProjDirty) return;
    this.viewProjDirty = false;

    const eye = this.controls.getCameraPosition();
    const view = mat4.lookAt(
      eye,
      this.camera.target,
      { x: 0, y: 1, z: 0 }
    );
    const proj = mat4.perspectiveReverseZ(
      Math.PI / 4,
      this.canvas.width / this.canvas.height,
      1.0,
      500
    );
    const viewProj = mat4.multiply(proj, view);

    this.device.queue.writeBuffer(this.uniformBuffer, 0, viewProj.m);
  }

  private resetHistogramBuffers(commandEncoder: GPUCommandEncoder) {
    const zero = new Uint32Array(HISTOGRAM_BINS).fill(0);
    this.device.queue.writeBuffer(this.histogramBuffers.hue, 0, zero);
    this.device.queue.writeBuffer(this.histogramBuffers.birth, 0, zero);
    this.device.queue.writeBuffer(this.histogramBuffers.survive, 0, zero);
    this.device.queue.writeBuffer(this.histogramBuffers.age, 0, zero);
  }

  private computeHistogram(commandEncoder: GPUCommandEncoder) {
    this.resetHistogramBuffers(commandEncoder);
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.histogramPipeline);
    pass.setBindGroup(0, this.histogramBindGroup);
    pass.dispatchWorkgroups(Math.ceil(GRID_VOLUME / 256), 1, 1);
    pass.end();

    commandEncoder.copyBufferToBuffer(
      this.histogramBuffers.hue, 0,
      this.histogramReadbackBuffers.hue, 0,
      HISTOGRAM_BINS * 4
    );
    commandEncoder.copyBufferToBuffer(
      this.histogramBuffers.birth, 0,
      this.histogramReadbackBuffers.birth, 0,
      HISTOGRAM_BINS * 4
    );
    commandEncoder.copyBufferToBuffer(
      this.histogramBuffers.survive, 0,
      this.histogramReadbackBuffers.survive, 0,
      HISTOGRAM_BINS * 4
    );
    commandEncoder.copyBufferToBuffer(
      this.histogramBuffers.age, 0,
      this.histogramReadbackBuffers.age, 0,
      HISTOGRAM_BINS * 4
    );
  }

  private async readHistogramData() {
    const readBuffer = async (buffer: GPUBuffer) => {
      await buffer.mapAsync(GPUMapMode.READ);
      const data = new Uint32Array(buffer.getMappedRange());
      const result = Array.from(data);
      buffer.unmap();
      return result;
    };

    try {
      const [hueData, birthData, surviveData, ageData] = await Promise.all([
        readBuffer(this.histogramReadbackBuffers.hue),
        readBuffer(this.histogramReadbackBuffers.birth),
        readBuffer(this.histogramReadbackBuffers.survive),
        readBuffer(this.histogramReadbackBuffers.age)
      ]);

      this.updateHistogramUI('hue-histogram', hueData);
      this.updateHistogramUI('birth-histogram', birthData);
      this.updateHistogramUI('survive-histogram', surviveData);
      this.updateHistogramUI('age-histogram', ageData);

      this.aliveCount = hueData.reduce((a, b) => a + b, 0);
      const totalAgeWeighted = ageData.reduce((sum, count, bin) => sum + count * (bin + 0.5) * (200 / HISTOGRAM_BINS), 0);
      this.totalAge = this.aliveCount > 0 ? totalAgeWeighted / this.aliveCount : 0;

      (document.getElementById('alive-count') as HTMLElement).textContent = this.aliveCount.toString();
      (document.getElementById('total-count') as HTMLElement).textContent = GRID_VOLUME.toString();
      (document.getElementById('avg-age') as HTMLElement).textContent = this.totalAge.toFixed(1);
    } catch (e) {}
  }

  private updateHistogramUI(containerId: string, data: number[]) {
    const container = document.getElementById(containerId)!;
    const bars = container.children;
    const maxVal = Math.max(...data, 1);
    const maxHeight = container.clientHeight - 4;
    const peakIdx = data.indexOf(maxVal);

    for (let i = 0; i < Math.min(bars.length, data.length); i++) {
      const height = Math.max(2, (data[i] / maxVal) * maxHeight);
      const bar = bars[i] as HTMLElement;
      bar.style.height = `${height}px`;
      bar.style.opacity = data[i] > 0 ? '1' : '0.3';
      
      if (i === peakIdx && data[i] > 0) {
        bar.classList.add('peak');
      } else {
        bar.classList.remove('peak');
      }
    }
  }

  private stepSimulation(commandEncoder: GPUCommandEncoder) {
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(this.lifePipeline);
    pass.setBindGroup(0, this.lifeBindGroups.read);
    pass.dispatchWorkgroups(GRID_SIZE / 8, GRID_SIZE / 8, GRID_SIZE / 8);
    pass.end();

    const temp = this.gridBuffers.current;
    this.gridBuffers.current = this.gridBuffers.next;
    this.gridBuffers.next = temp;
    this.createLifeBindGroups();
    this.createHistogramBindGroup();
    this.createRenderBindGroup();

    this.frameCount++;
    if (this.frameCount >= 1000) {
      this.triggerEvolution();
      this.frameCount = 0;
    }
  }

  private render(commandEncoder: GPUCommandEncoder) {
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 0.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    pass.draw(36, GRID_VOLUME);
    pass.end();
  }

  private animate = (time = 0) => {
    requestAnimationFrame(this.animate);

    this.updateUniforms();

    const commandEncoder = this.device.createCommandEncoder();

    if (!this.isPaused && time - this.lastUpdateTime >= this.updateSpeed) {
      this.stepSimulation(commandEncoder);
      this.lastUpdateTime = time;
    }

    this.computeHistogram(commandEncoder);
    this.render(commandEncoder);
    this.device.queue.submit([commandEncoder.finish()]);

    if (Math.floor(time / 500) !== Math.floor((time - 16) / 500)) {
      this.readHistogramData();
    }
  };
}

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const app = new GeneticParticleSystem(canvas);
  
  try {
    await app.init();
  } catch (e) {
    console.error(e);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:white;background:red;padding:20px;border-radius:8px;font-family:sans-serif;';
    errorDiv.textContent = 'Error: ' + (e as Error).message + '. Please use a browser that supports WebGPU (Chrome 113+, Edge 113+, etc.)';
    document.body.appendChild(errorDiv);
  }
}

main();
