#!/usr/bin/env node

const GameEngine = require('./game/GameEngine');
const Player = require('./entities/Player');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    seed: null,
    width: 50,
    height: 50,
    heroes: ['warrior', 'mage', 'priest'],
    monsters: 15,
    chests: 8,
    traps: 10,
    maxTurns: 500,
    exportMap: null,
    exportLog: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--seed':
      case '-s':
        options.seed = parseInt(nextArg);
        i++;
        break;
      case '--heroes':
        options.heroes = nextArg.split(',').map(h => h.trim().toLowerCase());
        i++;
        break;
      case '--monsters':
      case '-m':
        options.monsters = parseInt(nextArg);
        i++;
        break;
      case '--chests':
      case '-c':
        options.chests = parseInt(nextArg);
        i++;
        break;
      case '--traps':
      case '-t':
        options.traps = parseInt(nextArg);
        i++;
        break;
      case '--max-turns':
        options.maxTurns = parseInt(nextArg);
        i++;
        break;
      case '--export-map':
        options.exportMap = nextArg;
        i++;
        break;
      case '--export-log':
        options.exportLog = nextArg;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
洞穴探索者 - 多英雄小队自动探索游戏

用法: cave-explorer [选项]

选项:
  -s, --seed <数字>           随机种子 (用于复现地图)
      --heroes <职业列表>     英雄职业配置，逗号分隔 (默认: warrior,mage,priest)
                              可用职业: warrior(战士), mage(法师), priest(牧师)
  -m, --monsters <数字>       怪物数量 (默认: 15)
  -c, --chests <数字>         宝箱数量 (默认: 8)
  -t, --traps <数字>          陷阱数量 (默认: 10)
      --max-turns <数字>      最大回合数 (默认: 500)
      --export-map <文件>      导出地图ASCII文件
      --export-log <文件>      导出战斗日志文件
  -h, --help                  显示帮助信息

职业特性:
  战士(warrior): 高HP高防御，技能-重击(200%伤害)
  法师(mage):    低HP高攻击，技能-火球术(250%伤害)、暴风雪(群体攻击)
  牧师(priest):  均衡属性，技能-治愈术(恢复40%HP)、神圣之光(恢复80%HP)

示例:
  cave-explorer --seed 12345
  cave-explorer --heroes warrior,mage,priest -m 20
  cave-explorer --heroes warrior,warrior,priest --export-map map.txt
`);
}

function printTeamReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log('                        团 队 战 报');
  console.log('='.repeat(70));
  console.log(`种子: ${report.seed}`);
  console.log(`总回合数: ${report.totalTurns}`);
  console.log();
  console.log(`团队存活: ${report.teamAlive} / ${report.totalHeroes}`);
  console.log(`总击杀数: ${report.totalKills} / ${report.totalMonsters}`);
  console.log(`总伤害输出: ${report.totalDamageDealt}`);
  console.log(`总治疗量: ${report.totalHealingDone}`);
  console.log();
  console.log(`探索格子数: ${report.exploredTiles}`);
  console.log(`未开启宝箱: ${report.unopenedChests}`);
  console.log(`触发陷阱数: ${report.triggeredTraps}`);
  console.log();
  console.log('-'.repeat(70));
  console.log('各英雄贡献统计:');
  console.log('-'.repeat(70));

  for (const stats of report.heroStats) {
    const classInfo = Player.CLASSES[stats.heroClass];
    const status = stats.hp > 0 ? '存活' : '阵亡';
    const hpPercent = Math.max(0, Math.floor((stats.hp / stats.maxHp) * 100));

    console.log(`\n【${classInfo.name}】 - ${status}`);
    console.log(`  HP: ${Math.max(0, stats.hp)} / ${stats.maxHp} (${hpPercent}%)`);
    console.log(`  攻击力: ${stats.attack}  |  防御力: ${stats.defense}`);
    console.log(`  击杀数: ${stats.kills}`);
    console.log(`  伤害输出: ${stats.damageDealt}`);
    console.log(`  承受伤害: ${stats.damageTaken}`);
    console.log(`  治疗量: ${stats.healingDone}`);
    console.log(`  开启宝箱: ${stats.chestsOpened}`);
    console.log(`  探索贡献: ${stats.exploredTiles} 格`);

    if (stats.loot.length > 0) {
      const lootCount = {};
      for (const item of stats.loot) {
        lootCount[item] = (lootCount[item] || 0) + 1;
      }
      const lootStr = Object.entries(lootCount).map(([item, count]) => `${item}x${count}`).join(', ');
      console.log(`  战利品: ${lootStr}`);
    }
  }

  console.log();
  console.log('='.repeat(70));
}

function exportLog(filepath, report) {
  const fs = require('fs');
  const logContent = report.battleLog.join('\n');
  fs.writeFileSync(filepath, logContent);
  console.log(`战斗日志已导出到: ${filepath}`);
}

function main() {
  const options = parseArgs();

  const validClasses = Object.keys(Player.CLASSES);
  options.heroes = options.heroes.filter(h => validClasses.includes(h));
  if (options.heroes.length === 0) {
    options.heroes = ['warrior', 'mage', 'priest'];
  }

  const gameOptions = {
    width: options.width,
    height: options.height,
    seed: options.seed,
    heroClasses: options.heroes,
    monsterCount: options.monsters,
    chestCount: options.chests,
    trapCount: options.traps,
    maxTurns: options.maxTurns
  };

  const game = new GameEngine(gameOptions);
  game.init();

  if (options.exportMap) {
    game.exportAsciiMap(options.exportMap);
    console.log(`地图已导出到: ${options.exportMap}`);
  }

  const report = game.run();
  printTeamReport(report);

  if (options.exportLog) {
    exportLog(options.exportLog, report);
  }
}

main();
