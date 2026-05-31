const Entity = require('./Entity');

class Chest extends Entity {
  constructor(x, y, content) {
    super(x, y, 'chest');
    this.content = content;
    this.opened = false;
  }

  open() {
    if (!this.opened) {
      this.opened = true;
      return this.content;
    }
    return null;
  }
}

Chest.CONTENTS = ['gold', 'potion', 'sword', 'shield', 'gem', 'scroll'];

module.exports = Chest;
