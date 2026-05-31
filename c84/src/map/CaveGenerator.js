const Random = require('../utils/Random');

class CaveGenerator {
  constructor(width, height, seed) {
    this.width = width;
    this.height = height;
    this.random = new Random(seed);
    this.map = [];
  }

  generate(fillProbability = 0.45, iterations = 5) {
    this.initMap(fillProbability);
    for (let i = 0; i < iterations; i++) {
      this.smoothMap();
    }
    this.ensureConnectivity();
    return this.map;
  }

  initMap(fillProbability) {
    this.map = [];
    for (let y = 0; y < this.height; y++) {
      this.map[y] = [];
      for (let x = 0; x < this.width; x++) {
        if (x === 0 || x === this.width - 1 || y === 0 || y === this.height - 1) {
          this.map[y][x] = 1;
        } else {
          this.map[y][x] = this.random.chance(fillProbability) ? 1 : 0;
        }
      }
    }
  }

  smoothMap() {
    const newMap = [];
    for (let y = 0; y < this.height; y++) {
      newMap[y] = [];
      for (let x = 0; x < this.width; x++) {
        const neighbors = this.countWallNeighbors(x, y);
        if (neighbors > 4) {
          newMap[y][x] = 1;
        } else if (neighbors < 4) {
          newMap[y][x] = 0;
        } else {
          newMap[y][x] = this.map[y][x];
        }
      }
    }
    this.map = newMap;
  }

  countWallNeighbors(x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
          count++;
        } else if (this.map[ny][nx] === 1) {
          count++;
        }
      }
    }
    return count;
  }

  ensureConnectivity() {
    const regions = this.findRegions();
    if (regions.length <= 1) return;

    regions.sort((a, b) => b.length - a.length);
    const mainRegion = regions[0];

    for (let i = 1; i < regions.length; i++) {
      this.connectRegions(mainRegion, regions[i]);
    }
  }

  findRegions() {
    const visited = Array(this.height).fill(null).map(() => Array(this.width).fill(false));
    const regions = [];

    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (!visited[y][x] && this.map[y][x] === 0) {
          const region = this.floodFill(x, y, visited);
          if (region.length > 0) {
            regions.push(region);
          }
        }
      }
    }
    return regions;
  }

  floodFill(startX, startY, visited) {
    const region = [];
    const queue = [[startX, startY]];
    visited[startY][startX] = true;

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      region.push({ x, y });

      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 &&
            !visited[ny][nx] && this.map[ny][nx] === 0) {
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
    }
    return region;
  }

  connectRegions(regionA, regionB) {
    let bestDist = Infinity;
    let bestA = null;
    let bestB = null;

    for (const a of regionA) {
      for (const b of regionB) {
        const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestA = a;
          bestB = b;
        }
      }
    }

    if (bestA && bestB) {
      this.createCorridor(bestA, bestB);
    }
  }

  createCorridor(from, to) {
    let x = from.x;
    let y = from.y;

    while (x !== to.x || y !== to.y) {
      this.map[y][x] = 0;
      if (x < to.x) x++;
      else if (x > to.x) x--;
      else if (y < to.y) y++;
      else if (y > to.y) y--;
    }
    this.map[y][x] = 0;
  }

  getFloorTiles() {
    const floors = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.map[y][x] === 0) {
          floors.push({ x, y });
        }
      }
    }
    return floors;
  }
}

module.exports = CaveGenerator;
