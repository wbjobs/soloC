const Entity = require('./Entity');

class Player extends Entity {
  constructor(x, y, heroClass = 'warrior', customStats = {}) {
    super(x, y, 'player');
    this.heroClass = heroClass;

    const baseStats = Player.CLASSES[heroClass] || Player.CLASSES.warrior;

    this.maxHp = customStats.hp || baseStats.hp;
    this.hp = this.maxHp;
    this.attack = customStats.attack || baseStats.attack;
    this.defense = customStats.defense || baseStats.defense;
    this.critChance = customStats.critChance || baseStats.critChance;
    this.critMultiplier = customStats.critMultiplier || baseStats.critMultiplier;

    this.skills = [...baseStats.skills];
    this.skillCooldowns = {};
    this.skills.forEach(skill => {
      this.skillCooldowns[skill.name] = 0;
    });

    this.kills = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.healingDone = 0;
    this.loot = [];
    this.chestsOpened = 0;
    this.exploredTiles = 0;
  }

  takeDamage(damage) {
    const actualDamage = Math.max(1, damage - this.defense);
    this.hp -= actualDamage;
    this.damageTaken += actualDamage;
    return actualDamage;
  }

  calculateDamage(random) {
    const isCrit = random.chance(this.critChance);
    const baseDamage = this.attack;
    const finalDamage = isCrit ? Math.floor(baseDamage * this.critMultiplier) : baseDamage;
    this.damageDealt += finalDamage;
    return finalDamage;
  }

  isAlive() {
    return this.hp > 0;
  }

  addLoot(item) {
    this.loot.push(item);
  }

  addKill() {
    this.kills++;
  }

  heal(amount, source = 'self') {
    const actualHeal = Math.min(amount, this.maxHp - this.hp);
    this.hp += actualHeal;
    if (source !== 'self') {
      this.healingDone += actualHeal;
    }
    return actualHeal;
  }

  canUseSkill(skillName) {
    return this.skillCooldowns[skillName] === 0;
  }

  useSkill(skillName, targets, random) {
    if (!this.canUseSkill(skillName)) {
      return null;
    }

    const skill = this.skills.find(s => s.name === skillName);
    if (!skill) return null;

    const result = { skill: skill.name, type: skill.type };

    switch (skill.type) {
      case 'attack':
        if (targets && targets.length > 0) {
          const target = targets[0];
          const damage = Math.floor(this.attack * skill.power);
          result.target = target.constructor.name;
          result.damage = damage;
          this.damageDealt += damage;
        }
        break;

      case 'heal':
        if (targets && targets.length > 0) {
          const target = targets[0];
          const healAmount = Math.floor(this.maxHp * skill.power);
          const actualHeal = target.heal(healAmount, this.heroClass);
          result.target = target.heroClass;
          result.healAmount = actualHeal;
          this.healingDone += actualHeal;
        }
        break;

      case 'buff':
        if (targets && targets.length > 0) {
          result.targets = targets.map(t => t.heroClass);
          result.effect = skill.effect;
        }
        break;

      case 'aoe':
        if (targets && targets.length > 0) {
          const damage = Math.floor(this.attack * skill.power);
          result.targets = targets.map(t => t.constructor.name);
          result.damagePerTarget = damage;
          this.damageDealt += damage * targets.length;
        }
        break;
    }

    this.skillCooldowns[skillName] = skill.cooldown;
    return result;
  }

  reduceCooldowns() {
    for (const skillName in this.skillCooldowns) {
      if (this.skillCooldowns[skillName] > 0) {
        this.skillCooldowns[skillName]--;
      }
    }
  }

  getStats() {
    return {
      heroClass: this.heroClass,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      defense: this.defense,
      kills: this.kills,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      healingDone: this.healingDone,
      chestsOpened: this.chestsOpened,
      exploredTiles: this.exploredTiles,
      loot: this.loot
    };
  }
}

Player.CLASSES = {
  warrior: {
    name: '战士',
    hp: 150,
    attack: 20,
    defense: 10,
    critChance: 0.15,
    critMultiplier: 1.5,
    skills: [
      { name: '重击', type: 'attack', power: 2.0, cooldown: 3, description: '造成200%攻击力伤害' },
      { name: '嘲讽', type: 'buff', power: 0, cooldown: 4, effect: '吸引仇恨', description: '吸引怪物攻击' }
    ]
  },
  mage: {
    name: '法师',
    hp: 80,
    attack: 30,
    defense: 3,
    critChance: 0.25,
    critMultiplier: 2.0,
    skills: [
      { name: '火球术', type: 'attack', power: 2.5, cooldown: 2, description: '造成250%攻击力伤害' },
      { name: '暴风雪', type: 'aoe', power: 1.2, cooldown: 5, description: '对所有敌人造成120%伤害' }
    ]
  },
  priest: {
    name: '牧师',
    hp: 100,
    attack: 12,
    defense: 6,
    critChance: 0.1,
    critMultiplier: 1.3,
    skills: [
      { name: '治愈术', type: 'heal', power: 0.4, cooldown: 2, description: '恢复目标40%最大生命值' },
      { name: '神圣之光', type: 'heal', power: 0.8, cooldown: 5, description: '恢复目标80%最大生命值' }
    ]
  }
};

module.exports = Player;
