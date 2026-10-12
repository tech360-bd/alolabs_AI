-- ==========================================
-- ALO Labs Avatar Video Studio AI Agent
-- Complete MySQL Schema + Seed Data
-- ==========================================

CREATE DATABASE IF NOT EXISTS aloeduca_alo_crm 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE aloeduca_alo_crm;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'counselor', 'student', 'partner') NOT NULL DEFAULT 'student',
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  profile_image VARCHAR(255),
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  email_verified BOOLEAN DEFAULT 0,
  last_login TIMESTAMP NULL,
  login_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  country VARCHAR(100),
  intended_destination VARCHAR(100),
  intended_course VARCHAR(255),
  education_level VARCHAR(100),
  budget VARCHAR(100),
  status ENUM('new', 'contacted', 'qualified', 'application', 'enrolled', 'rejected', 'lost') DEFAULT 'new',
  source VARCHAR(100),
  score INT DEFAULT 0,
  assigned_to INT UNSIGNED,
  notes TEXT,
  tags JSON,
  last_contacted TIMESTAMP NULL,
  next_follow_up TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  lead_id INT UNSIGNED,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  nationality VARCHAR(100),
  passport_number VARCHAR(50),
  current_country VARCHAR(100),
  current_city VARCHAR(100),
  address TEXT,
  emergency_contact JSON,
  education_history JSON,
  work_experience JSON,
  english_test JSON,
  documents JSON,
  profile_completion INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  university_id INT UNSIGNED,
  course_id INT UNSIGNED,
  intake VARCHAR(50),
  status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn') DEFAULT 'draft',
  submitted_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  rejected_at TIMESTAMP NULL,
  rejection_reason TEXT,
  documents JSON,
  notes TEXT,
  timeline JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Brand kits table
CREATE TABLE IF NOT EXISTS brand_kits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand_key VARCHAR(100) UNIQUE NOT NULL,
  brand_name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(255),
  primary_color VARCHAR(20) DEFAULT '#0d1b2a',
  accent_color VARCHAR(20) DEFAULT '#f77f00',
  cta_text VARCHAR(255),
  website VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type VARCHAR(50) DEFAULT 'string'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add default seed data
INSERT INTO users (email, password, full_name, role, status) VALUES
('admin@aloeducation.com', 'admin123', 'ALO Labs Admin Operator', 'admin', 'active');

INSERT INTO brand_kits (brand_key, brand_name, primary_color, accent_color, cta_text, website, phone, email) VALUES
('alo_labs', 'ALO Labs', '#0d1b2a', '#f77f00', 'Automate Local AI with ALO Labs Solutions', 'alolabs.net', '+8801700000000', 'hello@alolabs.net'),
('alo_education', 'ALO Education', '#1a237e', '#ff6f00', 'Talk with top-tier consultants for study abroad!', 'aloeducation.com', '+8801999999999', 'info@aloeducation.com'),
('tech360', 'Tech360', '#111827', '#3b82f6', 'Integrate state-of-the-art enterprise workflow.', 'tech360.io', '+8801888888888', 'contact@tech360.io');

INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
('local_provider', 'Ollama', 'string'),
('ollama_url', 'http://localhost:11434', 'string'),
('tts_engine', 'Edge TTS', 'string');
