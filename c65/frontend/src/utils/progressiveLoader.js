import * as cornerstone from '@cornerstonejs/core';

export class ProgressiveVolumeLoader {
  constructor(studyId, options = {}) {
    this.studyId = studyId;
    this.loadedSlices = new Map();
    this.loadingSlices = new Set();
    this.priorityQueue = [];
    this.currentCenterSlice = null;
    this.batchSize = options.batchSize || 10;
    this.preloadRadius = options.preloadRadius || 30;
    this.totalSlices = 0;
    this.onSliceLoaded = options.onSliceLoaded || (() => {});
    this.isLoading = false;
  }

  async init(studyData) {
    this.totalSlices = studyData.slices_count;
    this.currentCenterSlice = Math.floor(this.totalSlices / 2);

    await this.loadPrioritySlices();
  }

  setCurrentSlice(sliceIndex) {
    this.currentCenterSlice = sliceIndex;
    this.updatePriorityQueue();
    this.processQueue();
  }

  updatePriorityQueue() {
    const center = this.currentCenterSlice;
    const radius = this.preloadRadius;

    const prioritySlices = [];

    for (let i = 0; i <= radius; i++) {
      if (center - i >= 0 && !this.loadedSlices.has(center - i)) {
        prioritySlices.push({
          index: center - i,
          priority: i
        });
      }
      if (i !== 0 && center + i < this.totalSlices && !this.loadedSlices.has(center + i)) {
        prioritySlices.push({
          index: center + i,
          priority: i
        });
      }
    }

    for (let i = 0; i < this.totalSlices; i++) {
      if (!this.loadedSlices.has(i) && !prioritySlices.find(s => s.index === i)) {
        prioritySlices.push({
          index: i,
          priority: Math.abs(i - center) + radius
        });
      }
    }

    this.priorityQueue = prioritySlices.sort((a, b) => a.priority - b.priority);
  }

  async loadPrioritySlices() {
    this.updatePriorityQueue();
    await this.processQueue();
  }

  async processQueue() {
    if (this.isLoading) return;
    this.isLoading = true;

    while (this.priorityQueue.length > 0) {
      const batch = this.priorityQueue.splice(0, this.batchSize);

      await Promise.all(
        batch.map(async (item) => {
          if (!this.loadedSlices.has(item.index) && !this.loadingSlices.has(item.index)) {
            this.loadingSlices.add(item.index);
            try {
              const sliceData = await this.fetchSlice(item.index);
              this.loadedSlices.set(item.index, sliceData);
              this.onSliceLoaded(item.index, sliceData);
            } catch (error) {
              console.error(`Failed to load slice ${item.index}:`, error);
            } finally {
              this.loadingSlices.delete(item.index);
            }
          }
        })
      );
    }

    this.isLoading = false;
  }

  async fetchSlice(instanceNumber) {
    const response = await fetch(
      `/api/studies/${this.studyId}/slice_data?instance_number=${instanceNumber}`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  getSlice(instanceNumber) {
    return this.loadedSlices.get(instanceNumber);
  }

  getLoadedCount() {
    return this.loadedSlices.size;
  }

  getProgress() {
    return this.getLoadedCount() / this.totalSlices;
  }

  isSliceLoaded(instanceNumber) {
    return this.loadedSlices.has(instanceNumber);
  }

  cancel() {
    this.priorityQueue = [];
    this.isLoading = false;
  }
}

export class WindowLevelController {
  constructor(viewport) {
    this.viewport = viewport;
    this.windowWidth = 2000;
    this.windowCenter = 1000;
  }

  setWindowLevel(windowWidth, windowCenter) {
    this.windowWidth = windowWidth;
    this.windowCenter = windowCenter;

    const voiRange = {
      lower: windowCenter - windowWidth / 2,
      upper: windowCenter + windowWidth / 2
    };

    this.viewport.setProperties({ voiRange });
    this.viewport.render();
  }

  getWindowLevel() {
    return {
      windowWidth: this.windowWidth,
      windowCenter: this.windowCenter
    };
  }

  applyPreset(preset) {
    const presets = {
      brain: { windowWidth: 80, windowCenter: 40 },
      bone: { windowWidth: 2000, windowCenter: 500 },
      lung: { windowWidth: 1500, windowCenter: -600 },
      softTissue: { windowWidth: 400, windowCenter: 50 },
      mediastinum: { windowWidth: 350, windowCenter: 50 }
    };

    const presetValues = presets[preset];
    if (presetValues) {
      this.setWindowLevel(presetValues.windowWidth, presetValues.windowCenter);
    }
  }

  adjust(deltaWidth, deltaCenter) {
    this.setWindowLevel(
      this.windowWidth + deltaWidth,
      this.windowCenter + deltaCenter
    );
  }
}

export async function setupCornerstone() {
  const canvas = document.createElement('canvas');
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);

  const viewportId = 'CT_AXIAL';
  const viewportInput = {
    viewportId,
    element: canvas,
    type: cornerstone.Enums.ViewportType.ORTHOGRAPHIC,
    defaultOptions: {
      orientation: cornerstone.Enums.OrientationAxis.AXIAL,
      background: [0, 0, 0],
    }
  };

  renderingEngine.enableElement(viewportInput);
  const viewport = renderingEngine.getViewport(viewportId);

  return { renderingEngine, viewport, canvas };
}
