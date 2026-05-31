import { HierarchicalNSW } from 'hnswlib-node';
import fs from 'fs-extra';
import path from 'path';

export class HNSWIndex {
  constructor(dim = 512) {
    this.dim = dim;
    this.index = null;
    this.metadata = [];
    this.maxElements = 10000;
  }

  init(maxElements = this.maxElements) {
    this.index = new HierarchicalNSW('cosine', this.dim);
    this.index.initIndex(maxElements);
    this.metadata = [];
  }

  addPoint(vector, metadata) {
    const label = this.metadata.length;
    this.index.addPoint(vector, label);
    this.metadata.push(metadata);
  }

  query(vector, k = 3) {
    if (!this.index || this.metadata.length === 0) {
      return [];
    }
    const result = this.index.searchKnn(vector, Math.min(k, this.metadata.length));
    return result.neighbors.map((label, idx) => ({
      ...this.metadata[label],
      similarity: 1 - result.distances[idx],
      rank: idx + 1
    }));
  }

  save(dirPath) {
    fs.ensureDirSync(dirPath);
    this.index.writeIndex(path.join(dirPath, 'index.hnsw'));
    fs.writeJSONSync(path.join(dirPath, 'metadata.json'), this.metadata);
  }

  load(dirPath) {
    const indexPath = path.join(dirPath, 'index.hnsw');
    const metadataPath = path.join(dirPath, 'metadata.json');
    
    if (!fs.existsSync(indexPath) || !fs.existsSync(metadataPath)) {
      throw new Error('Index files not found');
    }
    
    this.metadata = fs.readJSONSync(metadataPath);
    this.index = new HierarchicalNSW('cosine', this.dim);
    this.index.loadIndex(indexPath);
  }

  get length() {
    return this.metadata.length;
  }
}

export default HNSWIndex;
