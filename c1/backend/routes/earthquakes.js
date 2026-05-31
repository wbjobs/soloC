const express = require('express');
const router = express.Router();
const { clusterEarthquakes } = require('../utils/dbscan');

module.exports = (dbService) => {
  router.get('/recent', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours) || 24;
      if (hours < 1 || hours > 168) {
        return res.status(400).json({
          error: 'Hours must be between 1 and 168 (7 days)'
        });
      }

      const earthquakes = await dbService.getRecentEarthquakes(hours);
      res.json({
        success: true,
        count: earthquakes.length,
        data: earthquakes
      });
    } catch (error) {
      console.error('[API] Error in /recent:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  router.get('/cluster', async (req, res) => {
    try {
      const minutes = parseInt(req.query.minutes) || 10;
      const eps = parseFloat(req.query.eps) || 150;
      const minPts = parseInt(req.query.minPts) || 2;

      if (minutes < 1 || minutes > 1440) {
        return res.status(400).json({
          error: 'Minutes must be between 1 and 1440 (24 hours)'
        });
      }

      const earthquakes = await dbService.getRecentEarthquakesByMinutes(minutes);
      const result = clusterEarthquakes(earthquakes, eps, minPts);

      res.json({
        success: true,
        minutes,
        eps,
        minPts,
        totalEarthquakes: earthquakes.length,
        clusterCount: result.clusters.length,
        noiseCount: result.noise.length,
        clusters: result.clusters.map(c => ({
          id: c.id,
          size: c.size,
          latitude: c.latitude,
          longitude: c.longitude,
          avgMagnitude: c.avgMagnitude,
          maxMagnitude: c.maxMagnitude,
          totalMagnitude: c.totalMagnitude,
          members: c.members.map(m => ({
            id: m.id,
            magnitude: m.magnitude,
            place: m.place
          }))
        })),
        noise: result.noise
      });
    } catch (error) {
      console.error('[API] Error in /cluster:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const earthquake = await dbService.getEarthquakeById(id);
      
      if (!earthquake) {
        return res.status(404).json({
          success: false,
          error: 'Earthquake not found'
        });
      }

      res.json({
        success: true,
        data: earthquake
      });
    } catch (error) {
      console.error('[API] Error in /:id:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  return router;
};
