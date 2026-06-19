CREATE TABLE IF NOT EXISTS store_information (
  id SERIAL PRIMARY KEY,
  store_id INT REFERENCES stores(id),
  business_name VARCHAR(150),
  business_description TEXT,
  address TEXT,
  contact_number VARCHAR(50),
  email VARCHAR(100),
  logo TEXT,
  receipt_thank_you_message TEXT,
  receipt_footer_message TEXT,
  operating_hours VARCHAR(100),
  currency VARCHAR(20),
  theme_color VARCHAR(50),
  tax_rate DECIMAL(5,2),
  service_charge_rate DECIMAL(5,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE store_information
  ADD COLUMN IF NOT EXISTS store_id INT REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS business_description TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email VARCHAR(100),
  ADD COLUMN IF NOT EXISTS logo TEXT,
  ADD COLUMN IF NOT EXISTS receipt_thank_you_message TEXT,
  ADD COLUMN IF NOT EXISTS receipt_footer_message TEXT,
  ADD COLUMN IF NOT EXISTS operating_hours VARCHAR(100),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(20),
  ADD COLUMN IF NOT EXISTS theme_color VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS service_charge_rate DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS store_information_store_id_unique
  ON store_information(store_id);

INSERT INTO store_information (
  store_id,
  business_name,
  business_description,
  address,
  contact_number,
  email,
  receipt_thank_you_message,
  receipt_footer_message,
  operating_hours,
  currency,
  theme_color,
  tax_rate,
  service_charge_rate
)
SELECT
  s.id,
  'Ukay Hub - Main Branch',
  'Your one-stop shop for quality ukay-ukay finds! We offer affordable and stylish pre-loved items for the whole family.',
  '123 Sampaguita St., Barangay Guadalupe, Cebu City, Cebu, Philippines',
  '0917 123 4567',
  'ukayhub.main@gmail.com',
  'Thank you for shopping with us!',
  'We appreciate your support. Come again!',
  'Mon-Sun, 9:00 AM - 8:00 PM',
  'PHP',
  '#008967',
  0,
  0
FROM stores s
WHERE NOT EXISTS (
  SELECT 1
  FROM store_information si
  WHERE si.store_id = s.id
);

