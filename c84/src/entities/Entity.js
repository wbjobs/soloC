class Entity {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }
}

module.exports = Entity;
