const Random = require('../utils/Random');
const CaveGenerator = require('../map/CaveGenerator');
const AStar = require('../pathfinding/AStar');
const Player = require('../entities/Player');
const Monster = require('../entities/Monster');
const Chest = require('../entities/Chest');
const Trap = require('../entities/Trap');

class GameEngine {
  constructor(options = {}) {
    this.width = options.width || 50;
    this.height = options.height || 50;
    this.seed = options.seed || Date.now();
    this.random = new Random(this.seed);
    this.heroClasses = options.heroClasses || ['warrior', 'mage', 'priest'];
    this.monsterCount = options.monsterCount || 15;
    this.chestCount = options.chestCount || 8;
    this.trapCount = options.trapCount || 10;
    this.maxTurns = options.maxTurns || 500;

    this.map = null;
    this.astar = null;
    this.heroes = [];
    this.activeHeroIndex = 0;
    this.monsters = [];
    this.chests = [];
    this.traps = [];
    this.explored = new Set();
    this.battleLog = [];
    this.turn = 0;
    this.inCombat = false;
  }

  init() {
    const caveGen = new CaveGenerator(this.width, this.height, this.seed);
    this.map = caveGen.generate();
    this.astar = new AStar(this.map, 200);

    const floorTiles = caveGen.getFloorTiles();
    this.shuffleArray(floorTiles);

    this.placeEntities(floorTiles);
    this.log(`游戏初始化完成，种子: ${this.seed}`);
    this.log(`小队成员: ${this.heroes.map(h => Player.CLASSES[h.heroClass].name).join(', ')}`);
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.random.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  placeEntities(floorTiles) {
    let tileIndex = 0;

    for (let i = 0; i < this.heroClasses.length && tileIndex < floorTiles.length; i++) {
      const pos = floorTiles[tileIndex++];
      const hero = new Player(pos.x, pos.y, this.heroClasses[i]);
      this.heroes.push(hero);
    }

    const monsterTypes = Object.keys(Monster.TYPES);
    for (let i = 0; i < this.monsterCount && tileIndex < floorTiles.length; i++) {
      const pos = floorTiles[tileIndex++];
      const type = this.random.pick(monsterTypes);
      const monster = new Monster(pos.x, pos.y, type, Monster.TYPES[type]);
      this.monsters.push(monster);
    }

    for (let i = 0; i < this.chestCount && tileIndex < floorTiles.length; i++) {
      const pos = floorTiles[tileIndex++];
      const content = this.random.pick(Chest.CONTENTS);
      const chest = new Chest(pos.x, pos.y, content);
      this.chests.push(chest);
    }

    const trapTypes = Object.keys(Trap.TYPES);
    for (let i = 0; i < this.trapCount && tileIndex < floorTiles.length; i++) {
      const pos = floorTiles[tileIndex++];
      const type = this.random.pick(trapTypes);
      const trap = new Trap(pos.x, pos.y, type, Trap.TYPES[type].damage);
      this.traps.push(trap);
    }
  }

  getAliveHeroes() {
    return this.heroes.filter(h => h.isAlive());
  }

  getLeader() {
    return this.getAliveHeroes()[0] || this.heroes[0];
  }

  run() {
    this.log('开始自动探索...');

    while (this.turn < this.maxTurns && this.getAliveHeroes().length > 0) {
      this.turn++;

      const aliveMonsters = this.monsters.filter(m => m.isAlive());
      const nearbyMonsters = aliveMonsters.filter(m =>
        this.heroes.some(h => h.isAlive() &&
          Math.abs(m.x - h.x) + Math.abs(m.y - h.y) <= 2)
      );

      if (nearbyMonsters.length > 0) {
        this.teamCombat(nearbyMonsters);
      } else {
        this.teamExplore();
      }

      this.heroes.forEach(h => h.reduceCooldowns());
    }

    return this.generateTeamReport();
  }

  teamExplore() {
    const leader = this.getLeader();
    const target = this.findNearestTarget();

    if (!target) {
      this.log('没有更多目标，探索结束！');
      return;
    }

    const path = this.astar.findPath(leader.x, leader.y, target.x, target.y);

    if (!path || path.length < 2) {
      return;
    }

    const nextPos = path[1];

    for (const hero of this.getAliveHeroes()) {
      hero.setPosition(nextPos.x, nextPos.y);
      this.explored.add(`${nextPos.x},${nextPos.y}`);
      hero.exploredTiles++;
    }

    this.checkTraps();
    this.checkChests();
  }

  findNearestTarget() {
    const leader = this.getLeader();
    let nearest = null;
    let minDist = Infinity;

    const allTargets = [
      ...this.monsters.filter(m => m.isAlive()),
      ...this.chests.filter(c => !c.opened)
    ];

    for (const target of allTargets) {
      const dist = Math.abs(target.x - leader.x) + Math.abs(target.y - leader.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = target;
      }
    }

    return nearest;
  }

  checkTraps() {
    for (const trap of this.traps) {
      const heroOnTrap = this.getAliveHeroes().find(
        h => h.x === trap.x && h.y === trap.y
      );

      if (heroOnTrap && !trap.triggered) {
        const damage = trap.trigger();
        heroOnTrap.takeDamage(damage);
        this.log(`回合${this.turn}: ${Player.CLASSES[heroOnTrap.heroClass].name}触发了${trap.trapType}陷阱，受到${damage}点伤害！剩余HP: ${heroOnTrap.hp}`);

        if (!heroOnTrap.isAlive()) {
          this.log(`${Player.CLASSES[heroOnTrap.heroClass].name}在陷阱中倒下！`);
        }
        break;
      }
    }
  }

  checkChests() {
    for (const chest of this.chests) {
      const heroOnChest = this.getAliveHeroes().find(
        h => h.x === chest.x && h.y === chest.y
      );

      if (heroOnChest && !chest.opened) {
        const item = chest.open();
        heroOnChest.addLoot(item);
        heroOnChest.chestsOpened++;
        const className = Player.CLASSES[heroOnChest.heroClass].name;
        this.log(`回合${this.turn}: ${className}打开了宝箱，获得了: ${item}`);

        if (item === 'potion') {
          heroOnChest.heal(30);
          this.log(`${className}使用药水恢复了30点HP！当前HP: ${heroOnChest.hp}`);
        } else if (item === 'sword') {
          heroOnChest.attack += 5;
          this.log(`${className}装备剑，攻击力+5！当前攻击力: ${heroOnChest.attack}`);
        } else if (item === 'shield') {
          heroOnChest.defense += 3;
          this.log(`${className}装备盾牌，防御力+3！当前防御力: ${heroOnChest.defense}`);
        }
        break;
      }
    }
  }

  teamCombat(monsters) {
    this.log(`回合${this.turn}: 遭遇${monsters.length}只怪物！团队战斗开始！`);

    let round = 0;
    while (monsters.some(m => m.isAlive()) && this.getAliveHeroes().length > 0) {
      round++;

      this.performHeroActions(monsters);

      for (const monster of monsters.filter(m => m.isAlive())) {
        this.performMonsterAction(monster);
      }
    }

    const survivors = monsters.filter(m => m.isAlive()).length;
    if (survivors === 0) {
      this.log(`团队战斗胜利！消灭了${monsters.length}只怪物！`);
    } else {
      this.log(`战斗结束，${survivors}只怪物存活，${this.getAliveHeroes().length}名英雄存活`);
    }
  }

  performHeroActions(monsters) {
    const aliveHeroes = this.getAliveHeroes();
    const aliveMonsters = monsters.filter(m => m.isAlive());

    for (const hero of aliveHeroes) {
      if (aliveMonsters.length === 0) break;

      const className = Player.CLASSES[hero.heroClass].name;

      if (hero.heroClass === 'priest') {
        const injured = aliveHeroes.filter(h => h.hp < h.maxHp * 0.6);
        if (injured.length > 0 && hero.canUseSkill('治愈术')) {
          const target = injured.reduce((a, b) => a.hp < b.hp ? a : b);
          const result = hero.useSkill('治愈术', [target], this.random);
          if (result) {
            const targetName = Player.CLASSES[target.heroClass].name;
            this.log(`  ${className}使用治愈术，为${targetName}恢复了${result.healAmount}点HP！`);
          }
          continue;
        }
      }

      if (hero.heroClass === 'mage') {
        if (aliveMonsters.length > 1 && hero.canUseSkill('暴风雪')) {
          const result = hero.useSkill('暴风雪', aliveMonsters, this.random);
          if (result) {
            this.log(`  ${className}使用暴风雪，对所有敌人造成${result.damagePerTarget}点伤害！`);
            for (const monster of aliveMonsters) {
              monster.takeDamage(result.damagePerTarget, hero);
              if (!monster.isAlive()) {
                hero.addKill();
                this.log(`  ${Monster.TYPES[monster.monsterType].name}被消灭！`);
              }
            }
            continue;
          }
        }

        if (hero.canUseSkill('火球术')) {
          const target = aliveMonsters[0];
          const result = hero.useSkill('火球术', [target], this.random);
          if (result) {
            target.takeDamage(result.damage, hero);
            this.log(`  ${className}使用火球术，对${Monster.TYPES[target.monsterType].name}造成${result.damage}点伤害！`);
            if (!target.isAlive()) {
              hero.addKill();
              this.log(`  ${Monster.TYPES[target.monsterType].name}被消灭！`);
            }
            continue;
          }
        }
      }

      if (hero.heroClass === 'warrior') {
        if (hero.canUseSkill('重击')) {
          const target = aliveMonsters[0];
          const result = hero.useSkill('重击', [target], this.random);
          if (result) {
            target.takeDamage(result.damage, hero);
            this.log(`  ${className}使用重击，对${Monster.TYPES[target.monsterType].name}造成${result.damage}点伤害！`);
            if (!target.isAlive()) {
              hero.addKill();
              this.log(`  ${Monster.TYPES[target.monsterType].name}被消灭！`);
            }
            continue;
          }
        }
      }

      const target = aliveMonsters.find(m => m.isAlive());
      if (target) {
        const damage = hero.calculateDamage(this.random);
        target.takeDamage(damage, hero);
        this.log(`  ${className}普通攻击，对${Monster.TYPES[target.monsterType].name}造成${damage}点伤害`);
        if (!target.isAlive()) {
          hero.addKill();
          this.log(`  ${Monster.TYPES[target.monsterType].name}被消灭！`);
        }
      }
    }
  }

  performMonsterAction(monster) {
    const aliveHeroes = this.getAliveHeroes();
    const target = monster.selectTarget(aliveHeroes);

    if (target) {
      const className = Player.CLASSES[target.heroClass].name;
      const damage = monster.attack;
      const actualDamage = target.takeDamage(damage);
      this.log(`  ${Monster.TYPES[monster.monsterType].name}攻击${className}，造成${actualDamage}点伤害！${className}剩余HP: ${target.hp}`);

      if (!target.isAlive()) {
        this.log(`  ${className}在战斗中倒下！`);
      }
    }
  }

  randomMove() {
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    this.shuffleArray(directions);

    const leader = this.getLeader();
    for (const [dx, dy] of directions) {
      const nx = leader.x + dx;
      const ny = leader.y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && this.map[ny][nx] === 0) {
        for (const hero of this.getAliveHeroes()) {
          hero.setPosition(nx, ny);
          this.explored.add(`${nx},${ny}`);
          hero.exploredTiles++;
        }
        this.log(`回合${this.turn}: 团队随机移动到 (${nx}, ${ny})`);
        return true;
      }
    }
    return false;
  }

  log(message) {
    this.battleLog.push(message);
    console.log(message);
  }

  generateTeamReport() {
    const aliveHeroes = this.getAliveHeroes();
    const heroStats = this.heroes.map(h => h.getStats());
    const totalKills = heroStats.reduce((sum, s) => sum + s.kills, 0);
    const totalDamage = heroStats.reduce((sum, s) => sum + s.damageDealt, 0);
    const totalHealing = heroStats.reduce((sum, s) => sum + s.healingDone, 0);

    const report = {
      seed: this.seed,
      totalTurns: this.turn,
      teamAlive: aliveHeroes.length,
      totalHeroes: this.heroes.length,
      totalKills,
      totalDamageDealt: totalDamage,
      totalHealingDone: totalHealing,
      totalMonsters: this.monsters.length,
      survivingMonsters: this.monsters.filter(m => m.isAlive()).length,
      exploredTiles: this.explored.size,
      unopenedChests: this.chests.filter(c => !c.opened).length,
      triggeredTraps: this.traps.filter(t => t.triggered).length,
      heroStats,
      battleLog: this.battleLog
    };

    return report;
  }

  exportAsciiMap(filepath) {
    const fs = require('fs');
    let ascii = '';

    const displayMap = Array(this.height).fill(null).map(() =>
      Array(this.width).fill(null)
    );

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        displayMap[y][x] = this.map[y][x] === 1 ? '#' : '.';
      }
    }

    for (const trap of this.traps) {
      if (!trap.triggered) {
        displayMap[trap.y][trap.x] = '^';
      }
    }

    for (const chest of this.chests) {
      if (!chest.opened) {
        displayMap[chest.y][chest.x] = 'C';
      }
    }

    for (const monster of this.monsters) {
      if (monster.isAlive()) {
        displayMap[monster.y][monster.x] = 'M';
      }
    }

    const heroSymbols = { warrior: 'W', mage: 'M', priest: 'P' };
    for (const hero of this.heroes) {
      if (hero.isAlive()) {
        displayMap[hero.y][hero.x] = heroSymbols[hero.heroClass] || '@';
      }
    }

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        ascii += displayMap[y][x];
      }
      ascii += '\n';
    }

    ascii += '\n图例:\n';
    ascii += 'W: 战士\n';
    ascii += 'M: 法师\n';
    ascii += 'P: 牧师\n';
    ascii += 'M: 怪物\n';
    ascii += 'C: 宝箱\n';
    ascii += '^: 陷阱\n';
    ascii += '#: 墙壁\n';
    ascii += '.: 地板\n';

    fs.writeFileSync(filepath, ascii);
    return filepath;
  }
}

module.exports = GameEngine;
