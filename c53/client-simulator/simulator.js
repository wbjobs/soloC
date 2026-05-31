const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE_URL = 'http://localhost:8080/api/orderbook';

class TradingSimulator {
  constructor(options = {}) {
    this.numTraders = options.numTraders || 10;
    this.ordersPerSecond = options.ordersPerSecond || 5;
    this.symbol = options.symbol || 'BTC-USDT';
    this.basePrice = options.basePrice || 50000;
    this.priceRange = options.priceRange || 200;
    this.quantityRange = options.quantityRange || [0.1, 2.5];
    this.traders = this.generateTraders();
    this.stats = {
      totalOrders: 0,
      buyOrders: 0,
      sellOrders: 0,
      successfulOrders: 0,
      failedOrders: 0,
      matches: 0
    };
    this.running = false;
  }

  generateTraders() {
    const traders = [];
    for (let i = 0; i < this.numTraders; i++) {
      traders.push({
        id: `trader-${i + 1}`,
        name: `Trader ${i + 1}`
      });
    }
    return traders;
  }

  generateRandomPrice() {
    const halfRange = this.priceRange / 2;
    const variation = (Math.random() - 0.5) * this.priceRange;
    return Math.round((this.basePrice + variation) * 100) / 100;
  }

  generateRandomQuantity() {
    const [min, max] = this.quantityRange;
    return Math.round((min + Math.random() * (max - min)) * 1000) / 1000;
  }

  async sendOrder(trader) {
    const isBuy = Math.random() > 0.5;
    const order = {
      symbol: this.symbol,
      traderId: trader.id,
      side: isBuy ? 'BUY' : 'SELL',
      price: this.generateRandomPrice(),
      quantity: this.generateRandomQuantity()
    };

    try {
      const response = await axios.post(`${API_BASE_URL}/orders`, order, {
        timeout: 5000
      });
      
      this.stats.successfulOrders++;
      this.stats.totalOrders++;
      if (isBuy) {
        this.stats.buyOrders++;
      } else {
        this.stats.sellOrders++;
      }
      this.stats.matches += response.data.matchCount;
      
      console.log(`✓ ${trader.id} ${order.side} ${order.quantity} @ ${order.price} | Match: ${response.data.matchCount}`);
    } catch (error) {
      this.stats.failedOrders++;
      this.stats.totalOrders++;
      console.error(`✗ ${trader.id} Order failed:`, error.message);
    }
  }

  async runConcurrentRound() {
    const promises = [];
    const ordersPerTrader = Math.ceil(this.ordersPerSecond / this.numTraders);
    
    for (const trader of this.traders) {
      for (let i = 0; i < ordersPerTrader; i++) {
        promises.push(this.sendOrder(trader));
      }
    }
    
    await Promise.all(promises);
  }

  async start(durationInSeconds = 30) {
    console.log('🚀 Starting Trading Simulation');
    console.log(`   Traders: ${this.numTraders}`);
    console.log(`   Orders/sec: ${this.ordersPerSecond}`);
    console.log(`   Symbol: ${this.symbol}`);
    console.log(`   Duration: ${durationInSeconds}s`);
    console.log('----------------------------------------');
    
    this.running = true;
    const startTime = Date.now();
    const endTime = startTime + durationInSeconds * 1000;
    
    while (Date.now() < endTime && this.running) {
      const roundStart = Date.now();
      await this.runConcurrentRound();
      const roundDuration = Date.now() - roundStart;
      
      const sleepTime = Math.max(0, 1000 - roundDuration);
      if (sleepTime > 0) {
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }
    
    this.printStats();
    await this.verifyOrderBook();
  }

  stop() {
    this.running = false;
  }

  printStats() {
    console.log('----------------------------------------');
    console.log('📊 Simulation Statistics:');
    console.log(`   Total Orders: ${this.stats.totalOrders}`);
    console.log(`   Buy Orders: ${this.stats.buyOrders}`);
    console.log(`   Sell Orders: ${this.stats.sellOrders}`);
    console.log(`   Successful: ${this.stats.successfulOrders}`);
    console.log(`   Failed: ${this.stats.failedOrders}`);
    console.log(`   Total Matches: ${this.stats.matches}`);
    console.log('----------------------------------------');
  }

  async verifyOrderBook() {
    try {
      const response = await axios.get(`${API_BASE_URL}/${this.symbol}`);
      const orderBook = response.data;
      
      console.log('📈 Current Order Book Snapshot:');
      console.log(`   Symbol: ${orderBook.symbol}`);
      
      console.log('\n   Bids (Buy):');
      orderBook.bids.slice(0, 5).forEach(level => {
        console.log(`      $${level.price} | ${level.totalQuantity} (${level.orderCount} orders)`);
      });
      
      console.log('\n   Asks (Sell):');
      orderBook.asks.slice(0, 5).forEach(level => {
        console.log(`      $${level.price} | ${level.totalQuantity} (${level.orderCount} orders)`);
      });
      
    } catch (error) {
      console.error('Failed to fetch order book:', error.message);
    }
  }
}

if (require.main === module) {
  const simulator = new TradingSimulator({
    numTraders: 20,
    ordersPerSecond: 10,
    basePrice: 50000,
    priceRange: 100
  });
  
  simulator.start(60).catch(console.error);
}

module.exports = TradingSimulator;
