class InMemoryDBService {
  constructor() {
    this.earthquakes = [];
  }

  async saveEarthquake(earthquake) {
    const exists = this.earthquakes.find(e => e.id === earthquake.id);
    if (exists) {
      console.log(`[InMemoryDB] Earthquake already exists: ${earthquake.id}`);
      return null;
    }
    
    const record = {
      ...earthquake,
      created_at: new Date().toISOString()
    };
    this.earthquakes.push(record);
    console.log(`[InMemoryDB] Saved earthquake: ${earthquake.id}`);
    return record;
  }

  async getRecentEarthquakes(hours = 24) {
    const now = new Date();
    const threshold = new Date(now.getTime() - hours * 60 * 60 * 1000);
    
    return this.earthquakes
      .filter(eq => new Date(eq.time) >= threshold)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  async getRecentEarthquakesByMinutes(minutes = 60) {
    const now = new Date();
    const threshold = new Date(now.getTime() - minutes * 60 * 1000);
    
    return this.earthquakes
      .filter(eq => new Date(eq.time) >= threshold)
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  async getEarthquakeById(id) {
    return this.earthquakes.find(e => e.id === id) || null;
  }

  async initialize() {
    console.log('[InMemoryDB] Using in-memory database (development mode)');
    
    const clusters = [
      { name: 'Japan', centerLat: 37, centerLng: 142, spread: 3, count: 8 },
      { name: 'California', centerLat: 35, centerLng: -119, spread: 2, count: 6 },
      { name: 'Indonesia', centerLat: -3, centerLng: 127, spread: 4, count: 7 },
      { name: 'Chile', centerLat: -30, centerLng: -71, spread: 3, count: 5 }
    ];

    let idCounter = 0;
    const now = Date.now();
    
    clusters.forEach((cluster, cIdx) => {
      for (let i = 0; i < cluster.count; i++) {
        const pastMinutes = Math.random() * 5;
        const pastTime = new Date(now - pastMinutes * 60 * 1000);
        this.earthquakes.push({
          id: `seed_${idCounter++}`,
          magnitude: parseFloat((Math.random() * 5 + 2.5).toFixed(2)),
          latitude: parseFloat((cluster.centerLat + (Math.random() - 0.5) * cluster.spread * 2).toFixed(6)),
          longitude: parseFloat((cluster.centerLng + (Math.random() - 0.5) * cluster.spread * 2).toFixed(6)),
          depth: parseFloat((Math.random() * 200 + 10).toFixed(2)),
          place: cluster.name,
          time: pastTime.toISOString(),
          created_at: new Date().toISOString()
        });
      }
    });

    const randCount = 5;
    for (let i = 0; i < randCount; i++) {
      const pastMinutes = Math.random() * 55 + 5;
      const pastTime = new Date(now - pastMinutes * 60 * 1000);
      this.earthquakes.push({
        id: `seed_rand_${i}`,
        magnitude: parseFloat((Math.random() * 4 + 1).toFixed(2)),
        latitude: parseFloat((Math.random() * 170 - 85).toFixed(6)),
        longitude: parseFloat((Math.random() * 360 - 180).toFixed(6)),
        depth: parseFloat((Math.random() * 600).toFixed(2)),
        place: 'Pacific Ocean',
        time: pastTime.toISOString(),
        created_at: new Date().toISOString()
      });
    }

    console.log(`[InMemoryDB] Seeded ${idCounter + randCount} sample earthquakes (${clusters.length} spatial clusters)`);
  }

  async close() {
    console.log('[InMemoryDB] Database cleared');
    this.earthquakes = [];
  }
}

module.exports = InMemoryDBService;
