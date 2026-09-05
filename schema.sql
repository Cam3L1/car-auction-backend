-- =============================================================
-- MazadJo - Online Car Auction Platform
-- Database Schema + Seed Data (PostgreSQL)
-- Run this file to recreate the database with realistic data.
-- =============================================================

DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS cars;
DROP TABLE IF EXISTS users;

-- -------------------------------------------------------------
-- Users Table
-- -------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'normal' CHECK (role IN ('normal', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- Cars Table (auction listings)
-- status: active | ended | cancelled
-- -------------------------------------------------------------
CREATE TABLE cars (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  title          TEXT NOT NULL,
  make           TEXT NOT NULL,
  model          TEXT NOT NULL,
  year           INTEGER NOT NULL,
  mileage        INTEGER NOT NULL,
  description    TEXT NOT NULL,
  image_url      TEXT NOT NULL,
  starting_price NUMERIC(12,2) NOT NULL,
  current_price  NUMERIC(12,2) NOT NULL,
  end_time       TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- Bids Table (immutable, chronological record of every bid)
-- -------------------------------------------------------------
CREATE TABLE bids (
  id         SERIAL PRIMARY KEY,
  car_id     INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  amount     NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- SEED DATA
-- Passwords: admin123 -> admin, password123 -> every normal user
-- (hashed with Node crypto.scryptSync, stored as "salt:hash")
-- =============================================================

INSERT INTO users (id, username, email, password_hash, role) VALUES
(1, 'admin',   'admin@carbid.com', 'f0a75291958127c5020b854cf56bb375:def7d9398635760e2741ab16b81e8e4f5530499ef7a21bf6048c947e9d10b07d5123f2a64448c2bb906bb7ff49f3050f1e16b6808bf66abdc25a9461422d803d', 'admin'),
(2, 'sara_k',  'sara@example.com', '4109a026c8060401b33426dccd17de97:7267177a1bd6557157fb7194882f019899364dd1e89a7abc80224cd444a496f259012e70bbc151a64816724a792628b210d1999995422ef3dd40486ab6f6e991', 'normal'),
(3, 'omar_a',  'omar@example.com', '4109a026c8060401b33426dccd17de97:7267177a1bd6557157fb7194882f019899364dd1e89a7abc80224cd444a496f259012e70bbc151a64816724a792628b210d1999995422ef3dd40486ab6f6e991', 'normal'),
(4, 'lina_m',  'lina@example.com', '4109a026c8060401b33426dccd17de97:7267177a1bd6557157fb7194882f019899364dd1e89a7abc80224cd444a496f259012e70bbc151a64816724a792628b210d1999995422ef3dd40486ab6f6e991', 'normal'),
(5, 'khaled_h','khaled@example.com', '4109a026c8060401b33426dccd17de97:7267177a1bd6557157fb7194882f019899364dd1e89a7abc80224cd444a496f259012e70bbc151a64816724a792628b210d1999995422ef3dd40486ab6f6e991', 'normal');

-- Cars (prices in JOD, mileage in km)
INSERT INTO cars (id, user_id, title, make, model, year, mileage, description, image_url, starting_price, current_price, end_time, status) VALUES
-- Active auctions
(1, 2, 'Toyota Camry 2019 - Full Option', 'Toyota', 'Camry', 2019, 62000,
 'Well-maintained family sedan with full options. One previous owner, complete service history, new tires and recently replaced brakes. Interior is spotless.',
 '/images/car-1-toyota-camry.jpg',
 12000.00, 12800.00, NOW() + INTERVAL '2 days', 'active'),
(2, 3, 'BMW 320i 2021 - Sports Package', 'BMW', '320i', 2021, 41000,
 'Sporty 320i with M sports package, sunroof and Harman Kardon sound system. Accident-free, dealer maintained, warranty until 2026.',
 '/images/car-2-bmw-320i.jpg',
 25000.00, 25000.00, NOW() + INTERVAL '3 days', 'active'),
(3, 4, 'Tesla Model 3 2022 - Long Range', 'Tesla', 'Model 3', 2022, 28000,
 'Long Range dual motor with Autopilot. Battery at 95% health, home charger included. Amazing acceleration and near-zero running costs.',
 '/images/car-3-tesla-model3.jpg',
 30000.00, 31500.00, NOW() + INTERVAL '1 day', 'active'),
(4, 5, 'Honda CR-V 2020 - Family SUV', 'Honda', 'CR-V', 2020, 74000,
 'Spacious and reliable family SUV, 7-seater, rear camera, cruise control and Apple CarPlay. Perfect for school runs and weekend trips.',
 '/images/car-4-honda-crv.jpg',
 16500.00, 16500.00, NOW() + INTERVAL '4 days', 'active'),
(5, 2, 'Mercedes C200 2022 - AMG Line', 'Mercedes-Benz', 'C200', 2022, 35000,
 'Elegant C200 with AMG line package, ambient lighting and digital cockpit. Showroom condition, always garage-kept.',
 '/images/car-5-mercedes-c200.jpg',
 33000.00, 33800.00, NOW() + INTERVAL '5 hours', 'active'),
-- Ended auctions (winner = highest bidder)
(6, 3, 'Audi A4 2020 - Quattro', 'Audi', 'A4', 2020, 58000,
 'A4 Quattro with virtual cockpit and matrix LED headlights. Full service history at the official dealership.',
 '/images/car-6-audi-a4.jpg',
 19000.00, 20400.00, NOW() - INTERVAL '2 days', 'ended'),
(7, 5, 'Ford Mustang GT 2018 - V8', 'Ford', 'Mustang', 2018, 81000,
 'Legendary 5.0 V8 with manual transmission. Borla exhaust, recent clutch, and a sound that never gets old.',
 '/images/car-7-ford-mustang.jpg',
 27000.00, 28300.00, NOW() - INTERVAL '5 days', 'ended'),
-- Cancelled listing
(8, 4, 'Nissan Altima 2017 - Needs Inspection', 'Nissan', 'Altima', 2017, 95000,
 'Sold as-is, minor front bumper damage. Listing was cancelled by platform moderators because the mileage did not match the odometer photo.',
 '/images/car-8-nissan-altima.jpg',
 7500.00, 7500.00, NOW() + INTERVAL '2 days', 'cancelled');

-- Bids (chronological, immutable history)
INSERT INTO bids (id, car_id, user_id, amount, created_at) VALUES
-- Car 1: Toyota Camry (active)
(1, 1, 4, 12300.00, NOW() - INTERVAL '1 day 6 hours'),
(2, 1, 3, 12600.00, NOW() - INTERVAL '1 day 2 hours'),
(3, 1, 5, 12800.00, NOW() - INTERVAL '20 hours'),
-- Car 3: Tesla Model 3 (active)
(4, 3, 3, 30500.00, NOW() - INTERVAL '22 hours'),
(5, 3, 2, 31000.00, NOW() - INTERVAL '18 hours'),
(6, 3, 3, 31500.00, NOW() - INTERVAL '12 hours'),
-- Car 5: Mercedes C200 (active, ends soon)
(7, 5, 5, 33500.00, NOW() - INTERVAL '4 hours'),
(8, 5, 4, 33800.00, NOW() - INTERVAL '2 hours'),
-- Car 6: Audi A4 (ended, winner: lina_m)
(9,  6, 2, 19300.00, NOW() - INTERVAL '4 days'),
(10, 6, 4, 19600.00, NOW() - INTERVAL '3 days 20 hours'),
(11, 6, 2, 19900.00, NOW() - INTERVAL '3 days 10 hours'),
(12, 6, 4, 20400.00, NOW() - INTERVAL '2 days 4 hours'),
-- Car 7: Ford Mustang GT (ended, winner: sara_k)
(13, 7, 4, 27300.00, NOW() - INTERVAL '6 days'),
(14, 7, 2, 27700.00, NOW() - INTERVAL '5 days 20 hours'),
(15, 7, 4, 28000.00, NOW() - INTERVAL '5 days 6 hours'),
(16, 7, 2, 28300.00, NOW() - INTERVAL '5 days 2 hours');

-- Reset sequences so new inserts start after the seed ids
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('cars_id_seq',  (SELECT MAX(id) FROM cars));
SELECT setval('bids_id_seq',  (SELECT MAX(id) FROM bids));
