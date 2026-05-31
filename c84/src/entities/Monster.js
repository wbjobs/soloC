const Entity = require('./Entity');

class Monster extends Entity {
  constructor(x, y, type, stats) {
    super(x, y, 'monster');
    this.monsterType = type;
    this.maxHp = stats.hp;
    this.hp = this.maxHp;
    this.attack = stats.attack;
    this.defense = stats.defense;
    this.exp = stats.exp;
    this.loot = stats.loot || null;

    this.hatred = {};
    this.target = null;
  }

  takeDamage(damage, attacker) {
    const actualDamage = Math.max(1, damage - this.defense);
    this.hp -= actualDamage;

    if (attacker) {
      const attackerId = `${attacker.x},${attacker.y}`;
      this.hatred[attackerId] = (this.hatred[attackerId] || 0) + actualDamage;
    }

    return actualDamage;
  }

  selectTarget(players) {
    let maxHatred = -1;
    let selected = null;

    for (const player of players) {
      if (!player.isAlive()) continue;

      const dist = Math.abs(player.x - this.x) + Math.abs(player.y - this.y);
      if (dist <= 2) {
        const playerId = `${player.x},${player.y}`;
        const currentHatred = this.hatred[playerId] || 0;

        if (currentHatred > maxHatred) {
          maxHatred = currentHatred;
          selected = player;
        } else if (maxHatred === 0 && selected === null) {
          selected = player;
        }
      }
    }

    this.target = selected;
    return selected;
  }

  isAlive() {
    return this.hp > 0;
  }
}

Monster.TYPES = {
  goblin: { name: '哥布林', hp: 30, attack: 8, defense: 2, exp: 10, loot: 'gold' },
  orc: { name: '兽人', hp: 50, attack: 12, defense: 4, exp: 20, loot: 'sword' },
  skeleton: { name: '骷髅', hp: 40, attack: 10, defense: 3, exp: 15, loot: 'potion' },
  dragon: { name: '巨龙', hp: 100, attack: 20, defense: 8, exp: 50, loot: 'gem' }
};

module.exports = Monster;
