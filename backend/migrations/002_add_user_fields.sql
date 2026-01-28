
-- Update users table to include new fields
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email text UNIQUE,
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

-- Update existing admin user if exists
UPDATE users 
SET role = 'admin', permissions = '{"all": true}'::jsonb 
WHERE username = 'admin';
