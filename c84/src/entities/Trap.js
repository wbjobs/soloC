const Entity = require('./Entity');

class Trap extends Entity {
  constructor(x, y, type, damage) {
    super(x, y, 'trap');
    this.trapType = type;
    this.damage = damage;
    this.triggered = false;
  }

  trigger() {
    if (!this.triggered) {
      this.triggered = true;
      return this.damage;
    }
    return 0;
  }
}

Trap.TYPES = {
  spike: { damage: 15 },
  poison: { damage: 10 },
  fire: { damage: 20 }
};

module.exports = Trap;
