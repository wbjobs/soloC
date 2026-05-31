CREATE DATABASE earthquake_monitor;

\c earthquake_monitor;

CREATE TABLE IF NOT EXISTS earthquakes (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  magnitude DECIMAL(4, 2) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  depth DECIMAL(10, 2) NOT NULL,
  time TIMESTAMP WITH TIME ZONE NOT NULL,
  place VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_earthquakes_time ON earthquakes(time);
CREATE INDEX IF NOT EXISTS idx_earthquakes_magnitude ON earthquakes(magnitude);
