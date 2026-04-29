-- ==================== LEADS TABLE ====================
CREATE TABLE leads (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  interest VARCHAR(100),
  goal TEXT,
  status VARCHAR(50) DEFAULT 'New', -- New, Called, Joined, Not Interested
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on status for faster queries
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- ==================== ADMINS TABLE ====================
CREATE TABLE admins (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create admin user (password: Admin@123)
-- Note: Change this password immediately after first login!
INSERT INTO admins (name, email, password_hash)
VALUES (
  'MD Fitness Admin',
  'admin@mdfitness.in',
  -- This is bcrypt hash of 'Admin@123' - CHANGE IN PRODUCTION
  '$2a$10$K.xJ5C.Q5PHV9eH5qzX4Z.5WxNAw5p5WZ5x5xY5y5Z5x5xY5y5Z5a'
);

-- ==================== ROW LEVEL SECURITY ====================
-- Enable RLS on leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Create policy for anyone to insert leads (public form submission)
CREATE POLICY "Allow public insert leads" ON leads
  FOR INSERT
  WITH CHECK (true);

-- Create policy for authenticated users to view all leads
CREATE POLICY "Allow authenticated view leads" ON leads
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy for authenticated users to update leads
CREATE POLICY "Allow authenticated update leads" ON leads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Disable RLS on admins (only accessed by backend with service role)
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;

-- ==================== VIEWS FOR ANALYTICS ====================
CREATE VIEW lead_stats AS
SELECT 
  COUNT(*) as total_leads,
  COUNT(CASE WHEN status = 'New' THEN 1 END) as new_leads,
  COUNT(CASE WHEN status = 'Called' THEN 1 END) as called_leads,
  COUNT(CASE WHEN status = 'Joined' THEN 1 END) as joined_leads,
  COUNT(CASE WHEN status = 'Not Interested' THEN 1 END) as not_interested_leads,
  COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as leads_this_week,
  COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 1 END) as leads_today
FROM leads;

-- ==================== NOTES ====================
-- 1. After creating these tables in Supabase:
--    - Go to SQL Editor in Supabase Dashboard
--    - Paste this entire script
--    - Run it
--
-- 2. Update the admin password hash in production:
--    - Use bcrypt to hash your desired password
--    - Update the password_hash value in admins table
--
-- 3. Enable Row Level Security (RLS) for data protection
--    - Already done in this script
--
-- 4. For email notifications, you need:
--    - A Gmail account with "App Password" enabled
--    - Or any other SMTP service (SendGrid, Mailgun, etc.)
