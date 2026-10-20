-- =====================================================================
-- gaRAN — Migration 010 : saisie libre de marque + enrichissement catalogue
-- 1) Colonnes brand_label (marque en texte libre) pour devices et listings
-- 2) Nouvelles marques (dont marques chinoises/africaines) + modèles récents
-- Idempotent.
-- =====================================================================

ALTER TABLE devices  ADD COLUMN IF NOT EXISTS brand_label text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS brand_label text;

-- --- Nouvelles marques --------------------------------------------------
INSERT INTO brands (name, sort_order) VALUES
  ('Redmi', 6), ('Poco', 7), ('OnePlus', 15), ('ZTE', 16), ('Wiko', 17),
  ('TCL', 18), ('Alcatel', 19), ('Lava', 20), ('Nothing', 21), ('Hisense', 22),
  ('Lenovo', 23), ('Asus', 24), ('Sony', 25), ('Doogee', 26), ('Umidigi', 27),
  ('Realme', 9), ('Autre marque', 999)
ON CONFLICT ((lower(name))) DO NOTHING;

-- --- Nouveaux modèles ---------------------------------------------------
INSERT INTO models (brand_id, name)
SELECT b.id, m.name
FROM (VALUES
  -- Samsung (ajouts récents)
  ('Samsung','Galaxy A06'), ('Samsung','Galaxy A16'), ('Samsung','Galaxy A26'),
  ('Samsung','Galaxy A36'), ('Samsung','Galaxy A56'), ('Samsung','Galaxy S25'),
  ('Samsung','Galaxy S25 Ultra'), ('Samsung','Galaxy A07'), ('Samsung','Galaxy A17'),
  -- Apple (ajouts)
  ('Apple','iPhone 16e'), ('Apple','iPhone 17'), ('Apple','iPhone 17 Pro'), ('Apple','iPhone 17 Pro Max'),
  -- Redmi (marque à part entière)
  ('Redmi','Redmi 13C'), ('Redmi','Redmi 14C'), ('Redmi','Redmi A3'), ('Redmi','Redmi A5'),
  ('Redmi','Redmi Note 12'), ('Redmi','Redmi Note 13'), ('Redmi','Redmi Note 13 Pro'),
  ('Redmi','Redmi Note 14'), ('Redmi','Redmi Note 14 Pro'), ('Redmi','Redmi Note 14 Pro+'),
  ('Redmi','Redmi 13'), ('Redmi','Redmi 14'),
  -- Poco
  ('Poco','Poco C65'), ('Poco','Poco C75'), ('Poco','Poco M6'), ('Poco','Poco M7'),
  ('Poco','Poco X6'), ('Poco','Poco X7'), ('Poco','Poco X7 Pro'), ('Poco','Poco F6'),
  -- Xiaomi (ajouts série phares)
  ('Xiaomi','Xiaomi 14T'), ('Xiaomi','Xiaomi 15'), ('Xiaomi','Redmi Note 14'),
  -- Tecno
  ('Tecno','Spark 30'), ('Tecno','Spark 30 Pro'), ('Tecno','Spark Go 2024'),
  ('Tecno','Camon 40'), ('Tecno','Pova 7'), ('Tecno','Phantom V Fold'), ('Tecno','Phantom V Flip'),
  -- Infinix
  ('Infinix','Hot 50'), ('Infinix','Hot 50 Pro'), ('Infinix','Note 50'),
  ('Infinix','Smart 9'), ('Infinix','Zero 40'), ('Infinix','GT 20 Pro'),
  -- itel
  ('itel','A80'), ('itel','P65'), ('itel','S25'), ('itel','City 100'), ('itel','A05'),
  -- Oppo
  ('Oppo','A3'), ('Oppo','A3x'), ('Oppo','A60'), ('Oppo','A80'), ('Oppo','Reno 12'), ('Oppo','Reno 13'),
  -- Realme
  ('Realme','C61'), ('Realme','C63'), ('Realme','C75'), ('Realme','Note 60'), ('Realme','13'), ('Realme','14'),
  -- Vivo
  ('Vivo','Y19s'), ('Vivo','Y29'), ('Vivo','Y39'), ('Vivo','V40'),
  -- Honor
  ('Honor','X5b'), ('Honor','X6b'), ('Honor','X7c'), ('Honor','X9c'), ('Honor','200'),
  -- Huawei
  ('Huawei','Nova 13'), ('Huawei','Pura 70'),
  -- OnePlus
  ('OnePlus','Nord CE 4'), ('OnePlus','Nord 4'), ('OnePlus','12'), ('OnePlus','12R'), ('OnePlus','13'),
  -- ZTE / Wiko / TCL / Alcatel / Lava / Nothing
  ('ZTE','Blade A54'), ('ZTE','Blade V50'), ('ZTE','Nubia Neo 2'),
  ('Wiko','T60'), ('Wiko','Hi Enjoy 60'),
  ('TCL','40 SE'), ('TCL','50 SE'), ('TCL','406'),
  ('Alcatel','1B'), ('Alcatel','3L'),
  ('Lava','Blaze 2'), ('Lava','Yuva 3'),
  ('Nothing','Phone (2a)'), ('Nothing','Phone (3a)'), ('Nothing','CMF Phone 1'),
  -- Nokia / Motorola / Google (ajouts)
  ('Nokia','G42'), ('Nokia','C210'),
  ('Motorola','Moto G24'), ('Motorola','Moto G64'), ('Motorola','Edge 50'),
  ('Google','Pixel 9'), ('Google','Pixel 9 Pro')
) AS m(brand, name)
JOIN brands b ON lower(b.name) = lower(m.brand)
ON CONFLICT (brand_id, lower(name)) DO NOTHING;
