class AStar {
  constructor(map, maxStepLimit = 500) {
    this.map = map;
    this.width = map[0].length;
    this.height = map.length;
    this.maxStepLimit = maxStepLimit;
    this.pathCache = new Map();
    this.cacheHits = 0;
    this.cacheMaxSize = 100;
  }

  hasLineOfSight(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (x !== x2 || y !== y2) {
      if (this.map[y][x] === 1) {
        return false;
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return this.map[y2][x2] === 0;
  }

  getStraightLinePath(startX, startY, endX, endY) {
    if (!this.hasLineOfSight(startX, startY, endX, endY)) {
      return null;
    }

    const path = [];
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    let err = dx - dy;

    let x = startX;
    let y = startY;

    while (true) {
      path.push({ x, y });
      if (x === endX && y === endY) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return path;
  }

  getCacheKey(startX, startY, endX, endY) {
    return `${startX},${startY}-${endX},${endY}`;
  }

  clearCache() {
    this.pathCache.clear();
  }

  findPath(startX, startY, endX, endY) {
    if (this.map[startY][startX] === 1 || this.map[endY][endX] === 1) {
      return null;
    }

    if (startX === endX && startY === endY) {
      return [{ x: startX, y: startY }];
    }

    const cacheKey = this.getCacheKey(startX, startY, endX, endY);
    if (this.pathCache.has(cacheKey)) {
      this.cacheHits++;
      return this.pathCache.get(cacheKey);
    }

    const straightPath = this.getStraightLinePath(startX, startY, endX, endY);
    if (straightPath) {
      this.addToCache(cacheKey, straightPath);
      return straightPath;
    }

    const openSet = [];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const startKey = `${startX},${startY}`;
    const endKey = `${endX},${endY}`;

    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(startX, startY, endX, endY));
    openSet.push({ x: startX, y: startY, f: fScore.get(startKey) });

    let steps = 0;

    while (openSet.length > 0) {
      steps++;
      if (steps > this.maxStepLimit) {
        return this.getFallbackPath(startX, startY, endX, endY);
      }

      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      const currentKey = `${current.x},${current.y}`;

      if (current.x === endX && current.y === endY) {
        const path = this.reconstructPath(cameFrom, current);
        this.addToCache(cacheKey, path);
        return path;
      }

      closedSet.add(currentKey);

      const neighbors = this.getNeighbors(current.x, current.y, endX, endY);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (closedSet.has(neighborKey)) continue;

        const tentativeG = gScore.get(currentKey) + 1;

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          fScore.set(neighborKey, tentativeG + this.heuristic(neighbor.x, neighbor.y, endX, endY));

          if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
            openSet.push({ x: neighbor.x, y: neighbor.y, f: fScore.get(neighborKey) });
          }
        }
      }
    }

    return this.getFallbackPath(startX, startY, endX, endY);
  }

  getFallbackPath(startX, startY, endX, endY) {
    const path = [{ x: startX, y: startY }];
    const directions = this.getPriorityDirections(startX, startY, endX, endY);

    for (const [dx, dy] of directions) {
      const nx = startX + dx;
      const ny = startY + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.map[ny][nx] === 0) {
        path.push({ x: nx, y: ny });
        break;
      }
    }

    return path.length > 1 ? path : null;
  }

  getPriorityDirections(x, y, targetX, targetY) {
    const dx = targetX - x;
    const dy = targetY - y;

    const directions = [];

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) directions.push([1, 0]);
      else if (dx < 0) directions.push([-1, 0]);
      if (dy > 0) directions.push([0, 1]);
      else if (dy < 0) directions.push([0, -1]);
    } else {
      if (dy > 0) directions.push([0, 1]);
      else if (dy < 0) directions.push([0, -1]);
      if (dx > 0) directions.push([1, 0]);
      else if (dx < 0) directions.push([-1, 0]);
    }

    directions.push([0, -1], [0, 1], [-1, 0], [1, 0]);

    const unique = [];
    const seen = new Set();
    for (const dir of directions) {
      const key = `${dir[0]},${dir[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(dir);
      }
    }

    return unique;
  }

  heuristic(x1, y1, x2, y2) {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return dx + dy;
  }

  getNeighbors(x, y, targetX, targetY) {
    const neighbors = [];
    const directions = this.getPriorityDirections(x, y, targetX, targetY);

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.map[ny][nx] === 0) {
        neighbors.push({ x: nx, y: ny });
      }
    }
    return neighbors;
  }

  reconstructPath(cameFrom, current) {
    const path = [];
    let curr = current;
    while (curr) {
      path.unshift({ x: curr.x, y: curr.y });
      curr = cameFrom.get(`${curr.x},${curr.y}`);
    }
    return path;
  }

  addToCache(key, path) {
    if (this.pathCache.size >= this.cacheMaxSize) {
      const firstKey = this.pathCache.keys().next().value;
      this.pathCache.delete(firstKey);
    }
    this.pathCache.set(key, path);
  }
}

module.exports = AStar;
