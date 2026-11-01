-- Run this file against your Cloudflare D1 database.
CREATE TABLE IF NOT EXISTS reading_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 30),
    read_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reading_events_client_day
    ON reading_events (client_id, day_number);

CREATE INDEX IF NOT EXISTS idx_reading_events_client_date
    ON reading_events (client_id, read_at);
