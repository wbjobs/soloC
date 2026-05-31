const AStar = require('./src/pathfinding/AStar');

function createTestMap(width, height, type = 'simple') {
  const map = Array(height).fill(null).map(() => Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    map[y][0] = 1;
    map[y][width - 1] = 1;
  }
  for (let x = 0; x < width; x++) {
    map[0][x] = 1;
    map[height - 1][x] = 1;
  }

  if (type === 'narrow') {
    for (let x = 0; x < width - 3; x++) {
      map[Math.floor(height / 2)][x] = 1;
    }
    map[Math.floor(height / 2)][width - 3] = 0;
  } else if (type === 'maze') {
    for (let i = 2; i < height - 2; i += 2) {
      for (let x = 2; x < width - 2; x++) {
        if (x !== Math.floor(width / 2)) {
          map[i][x] = 1;
        }
      }
    }
  }

  return map;
}

function runTest(name, map, startX, startY, endX, endY) {
  console.log(`\n=== ${name} ===`);
  console.log(`起点: (${startX}, ${startY}), 终点: (${endX}, ${endY})`);

  const astar = new AStar(map, 100);

  const hasLOS = astar.hasLineOfSight(startX, startY, endX, endY);
  console.log(`视线检查: ${hasLOS ? '有' : '无'}`);

  const path = astar.findPath(startX, startY, endX, endY);
  if (path) {
    console.log(`寻路成功, 路径长度: ${path.length}`);
    console.log(`缓存命中: ${astar.cacheHits}`);
  } else {
    console.log('寻路失败');
  }

  return path;
}

console.log('寻路改进测试开始...');

const simpleMap = createTestMap(20, 20, 'simple');
runTest('简单开阔地图', simpleMap, 2, 2, 17, 17);

const narrowMap = createTestMap(20, 20, 'narrow');
runTest('狭长通道地图', narrowMap, 2, 2, 17, 17);

const mazeMap = createTestMap(30, 30, 'maze');
runTest('迷宫地图', mazeMap, 2, 2, 27, 27);

console.log('\n=== 缓存测试 ===');
const astar = new AStar(simpleMap, 100);
astar.findPath(2, 2, 10, 10);
console.log(`第一次寻路后缓存命中: ${astar.cacheHits}`);
astar.findPath(2, 2, 10, 10);
console.log(`第二次寻路后缓存命中: ${astar.cacheHits}`);

console.log('\n测试完成!');
