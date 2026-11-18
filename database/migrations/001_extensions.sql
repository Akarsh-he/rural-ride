-- ============================================================
-- Migration 001: PostgreSQL Extensions
-- Rural Mobility Super App — Varanasi, India
-- ============================================================
-- Idempotent: safe to run multiple times

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_topology";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
