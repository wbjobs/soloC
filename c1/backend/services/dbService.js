const pool = require('../config/db');

class DBService {
  async saveEarthquake(earthquake) {
    const query = `
      INSERT INTO earthquakes (event_id, magnitude, latitude, longitude, depth, time, place)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING *
    `;

    const values = [
      earthquake.id,
      earthquake.magnitude,
      earthquake.latitude,
      earthquake.longitude,
      earthquake.depth,
      earthquake.time,
      earthquake.place
    ];

    try {
      const result = await pool.query(query, values);
      if (result.rows.length > 0) {
        console.log(`[DB] Saved earthquake: ${earthquake.id}`);
        return result.rows[0];
      } else {
        console.log(`[DB] Earthquake already exists: ${earthquake.id}`);
        return null;
      }
    } catch (error) {
      console.error('[DB] Error saving earthquake:', error);
      throw error;
    }
  }

  async getRecentEarthquakes(hours = 24) {
    const query = `
      SELECT 
        event_id as id,
        magnitude,
        latitude,
        longitude,
        depth,
        place,
        time
      FROM earthquakes 
      WHERE time >= NOW() - INTERVAL '$1 hours'
      ORDER BY time DESC
    `;

    try {
      const result = await pool.query(
        `SELECT 
          event_id as id,
          magnitude,
          latitude,
          longitude,
          depth,
          place,
          time
        FROM earthquakes 
        WHERE time >= NOW() - INTERVAL '${hours} hours'
        ORDER BY time DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('[DB] Error fetching recent earthquakes:', error);
      throw error;
    }
  }

  async getRecentEarthquakesByMinutes(minutes = 60) {
    try {
      const result = await pool.query(
        `SELECT 
          event_id as id,
          magnitude,
          latitude,
          longitude,
          depth,
          place,
          time
        FROM earthquakes 
        WHERE time >= NOW() - INTERVAL '${minutes} minutes'
        ORDER BY time DESC`
      );
      return result.rows;
    } catch (error) {
      console.error('[DB] Error fetching recent earthquakes by minutes:', error);
      throw error;
    }
  }

  async getEarthquakeById(id) {
    const query = `
      SELECT 
        event_id as id,
        magnitude,
        latitude,
        longitude,
        depth,
        place,
        time
      FROM earthquakes 
      WHERE event_id = $1
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('[DB] Error fetching earthquake by ID:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      await pool.query('SELECT 1');
      console.log('[DB] Database connection established');
    } catch (error) {
      console.error('[DB] Failed to connect to database:', error);
      throw error;
    }
  }

  async close() {
    await pool.end();
    console.log('[DB] Database connection closed');
  }
}

module.exports = DBService;
