const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'globalbank.db');
const db = new sqlite3.Database(dbPath);

function initializeTables() {
  // Admins table
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_type TEXT DEFAULT 'savings',
    balance REAL DEFAULT 0.0,
    wallet_address TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    created_by INTEGER,
    FOREIGN KEY (created_by) REFERENCES admins(id)
  )`);

  // Transactions table
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    sender_account TEXT,
    receiver_account TEXT,
    sender_name TEXT,
    receiver_name TEXT,
    bank_name TEXT,
    wallet_address TEXT,
    description TEXT,
    status TEXT DEFAULT 'completed',
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Wallet Mining table
  db.run(`CREATE TABLE IF NOT EXISTS wallet_mining (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    amount_mined REAL DEFAULT 150000.00,
    mining_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Activity Logs table
  db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
}

// Initialize tables and create default admin
initializeTables();

// Create default admin after tables are created
setTimeout(() => {
  const defaultAdmin = {
    username: 'admin',
    password: '$2a$10$RbVym9OYTIl2nXlf.JA5quAzwBCQin.5Qe9CztxYc6DFmFEH/aUD.', // Hash of 'admin123'
    email: 'admin@globalbank.com',
    phone: '+2348000000000'
  };

  db.run(`INSERT OR IGNORE INTO admins (username, password, email, phone) VALUES (?, ?, ?, ?)`,
    [defaultAdmin.username, defaultAdmin.password, defaultAdmin.email, defaultAdmin.phone],
    (err) => {
      if (err) {
        console.error('Error creating default admin:', err.message);
      } else {
        console.log('Default admin created - Username: admin, Password: admin123');
      }
    });
}, 500);

module.exports = db;