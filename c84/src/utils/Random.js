class Random {
  constructor(seed) {
    this.seed = seed || Date.now();
    this.state = this.seed;
  }

  next() {
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(array) {
    return array[this.nextInt(0, array.length - 1)];
  }
}

module.exports = Random;
