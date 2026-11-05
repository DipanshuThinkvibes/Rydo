-- GPS points (vehicle_locations) split into one partition per day (UTC), so retention drops whole days cheaply.
-- Partitions live in schema "gps" so Prisma only ever sees the parent table in "public".
CREATE SCHEMA IF NOT EXISTS gps;

ALTER TABLE vehicle_locations RENAME TO vehicle_locations_old;
ALTER TABLE vehicle_locations_old RENAME CONSTRAINT vehicle_locations_pkey TO vehicle_locations_old_pkey;
ALTER INDEX vehicle_locations_ride_id_recorded_at_idx RENAME TO vehicle_locations_old_ride_idx;

CREATE TABLE vehicle_locations (LIKE vehicle_locations_old INCLUDING DEFAULTS) PARTITION BY RANGE (recorded_at);
ALTER SEQUENCE vehicle_locations_id_seq OWNED BY vehicle_locations.id;
ALTER TABLE vehicle_locations ADD CONSTRAINT vehicle_locations_pkey PRIMARY KEY (id, recorded_at);
CREATE INDEX vehicle_locations_ride_id_recorded_at_idx ON vehicle_locations (ride_id, recorded_at);
CREATE TABLE gps.vehicle_locations_default PARTITION OF vehicle_locations DEFAULT;

-- Creates the partition for each day from `from_day` to today + days_ahead (UTC). Safe to run any time.
CREATE OR REPLACE FUNCTION gps.ensure_partitions(days_ahead int DEFAULT 7, from_day date DEFAULT (now() AT TIME ZONE 'UTC')::date)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE d date; made int := 0; name text;
BEGIN
  FOR d IN SELECT generate_series(from_day, (now() AT TIME ZONE 'UTC')::date + days_ahead, interval '1 day')::date LOOP
    name := 'vehicle_locations_' || to_char(d, 'YYYYMMDD');
    IF to_regclass('gps.' || name) IS NULL THEN
      -- A day that already has rows in the default partition is left there (rare: only if this job did not run).
      IF EXISTS (SELECT 1 FROM gps.vehicle_locations_default WHERE recorded_at >= d AND recorded_at < d + 1) THEN CONTINUE; END IF;
      EXECUTE format('CREATE TABLE gps.%I PARTITION OF public.vehicle_locations FOR VALUES FROM (%L) TO (%L)', name, d::timestamptz, (d + 1)::timestamptz);
      made := made + 1;
    END IF;
  END LOOP;
  RETURN made;
END $$;

-- Drops day partitions older than keep_days; a day that holds points of a ride with an SOS is kept until sos_keep_days.
CREATE OR REPLACE FUNCTION gps.drop_old_partitions(keep_days int DEFAULT 30, sos_keep_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE r record; day date; dropped int := 0; has_sos boolean;
BEGIN
  FOR r IN SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE i.inhparent = 'public.vehicle_locations'::regclass AND n.nspname = 'gps' AND c.relname ~ '^vehicle_locations_\d{8}$' LOOP
    day := to_date(right(r.relname, 8), 'YYYYMMDD');
    IF day >= (now() AT TIME ZONE 'UTC')::date - keep_days THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM gps.%I v JOIN sos_events s ON s.ride_id = v.ride_id)', r.relname) INTO has_sos;
    IF has_sos AND day >= (now() AT TIME ZONE 'UTC')::date - sos_keep_days THEN CONTINUE; END IF;
    EXECUTE format('DROP TABLE gps.%I', r.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END $$;

-- Partitions for every day that already has points, then the next week; then move the points across.
SELECT gps.ensure_partitions(7, COALESCE((SELECT min(recorded_at AT TIME ZONE 'UTC')::date FROM vehicle_locations_old), (now() AT TIME ZONE 'UTC')::date));
INSERT INTO vehicle_locations SELECT * FROM vehicle_locations_old;
DROP TABLE vehicle_locations_old;