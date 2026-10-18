-- =====================================================================
-- gaRAN — Migration 002 : référentiel initial marques / modèles
-- Idempotent. Les modèles manquants s'ajoutent ensuite depuis le back-office.
-- =====================================================================

INSERT INTO brands (name, sort_order) VALUES
  ('Samsung', 1), ('Apple', 2), ('Tecno', 3), ('Infinix', 4), ('itel', 5),
  ('Xiaomi', 6), ('Oppo', 7), ('Huawei', 8), ('Realme', 9), ('Honor', 10),
  ('Vivo', 11), ('Nokia', 12), ('Google', 13), ('Motorola', 14)
ON CONFLICT ((lower(name))) DO NOTHING;

INSERT INTO models (brand_id, name)
SELECT b.id, m.name
FROM (VALUES
  ('Samsung','Galaxy A05'), ('Samsung','Galaxy A05s'), ('Samsung','Galaxy A14'), ('Samsung','Galaxy A15'),
  ('Samsung','Galaxy A24'), ('Samsung','Galaxy A25'), ('Samsung','Galaxy A34'), ('Samsung','Galaxy A35'),
  ('Samsung','Galaxy A54'), ('Samsung','Galaxy A55'), ('Samsung','Galaxy S22'), ('Samsung','Galaxy S23'),
  ('Samsung','Galaxy S23 Ultra'), ('Samsung','Galaxy S24'), ('Samsung','Galaxy S24 Ultra'),
  ('Samsung','Galaxy Z Flip5'), ('Samsung','Galaxy Z Fold5'),
  ('Apple','iPhone X'), ('Apple','iPhone XR'), ('Apple','iPhone XS Max'), ('Apple','iPhone 11'),
  ('Apple','iPhone 11 Pro Max'), ('Apple','iPhone 12'), ('Apple','iPhone 12 Pro Max'), ('Apple','iPhone 13'),
  ('Apple','iPhone 13 Pro Max'), ('Apple','iPhone 14'), ('Apple','iPhone 14 Pro Max'), ('Apple','iPhone 15'),
  ('Apple','iPhone 15 Pro'), ('Apple','iPhone 15 Pro Max'), ('Apple','iPhone 16'), ('Apple','iPhone 16 Pro'),
  ('Apple','iPhone 16 Pro Max'),
  ('Tecno','Spark 10'), ('Tecno','Spark 20'), ('Tecno','Spark 20 Pro'), ('Tecno','Camon 20'),
  ('Tecno','Camon 30'), ('Tecno','Pova 5'), ('Tecno','Pova 6'), ('Tecno','Phantom X2'),
  ('Infinix','Hot 30'), ('Infinix','Hot 40'), ('Infinix','Hot 40i'), ('Infinix','Note 30'),
  ('Infinix','Note 40'), ('Infinix','Smart 8'), ('Infinix','Zero 30'),
  ('itel','A05s'), ('itel','A70'), ('itel','P40'), ('itel','P55'), ('itel','S23'),
  ('Xiaomi','Redmi 13C'), ('Xiaomi','Redmi A3'), ('Xiaomi','Redmi Note 12'), ('Xiaomi','Redmi Note 13'),
  ('Xiaomi','Redmi Note 13 Pro'), ('Xiaomi','Xiaomi 13T'), ('Xiaomi','Xiaomi 14'),
  ('Oppo','A18'), ('Oppo','A38'), ('Oppo','A58'), ('Oppo','A78'), ('Oppo','Reno 10'), ('Oppo','Reno 11'),
  ('Huawei','Nova 11'), ('Huawei','Nova 12'), ('Huawei','P60 Pro'), ('Huawei','Y9a'),
  ('Realme','C53'), ('Realme','C55'), ('Realme','C67'), ('Realme','Note 50'), ('Realme','11'),
  ('Honor','X6a'), ('Honor','X7b'), ('Honor','X8b'), ('Honor','90'),
  ('Vivo','Y17s'), ('Vivo','Y27'), ('Vivo','Y36'),
  ('Nokia','105'), ('Nokia','106'), ('Nokia','110'), ('Nokia','C32'), ('Nokia','G21'),
  ('Google','Pixel 7'), ('Google','Pixel 7 Pro'), ('Google','Pixel 8'), ('Google','Pixel 8 Pro'),
  ('Motorola','Moto G54'), ('Motorola','Moto E13')
) AS m(brand, name)
JOIN brands b ON lower(b.name) = lower(m.brand)
ON CONFLICT (brand_id, lower(name)) DO NOTHING;
