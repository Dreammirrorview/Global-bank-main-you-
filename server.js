const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'globalbank-secret-key-olawale';

app.use(cors());
app.use(express.json());

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'globalbank.noreply@gmail.com',
    pass: 'your-app-password' // Replace with actual app password
  }
});

// Generate wallet address
function generateWalletAddress() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let wallet = '0x';
  for (let i = 0; i < 42; i++) {
    wallet += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return wallet;
}

// Generate account number (1-10 digits)
function generateAccountNumber() {
  const length = Math.floor(Math.random() * 10) + 1;
  let account = '';
  for (let i = 0; i < length; i++) {
    account += Math.floor(Math.random() * 10);
  }
  return account;
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ adminId: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    
    // Log activity
    db.run('INSERT INTO activity_logs (admin_id, action, details) VALUES (?, ?, ?)',
      [admin.id, 'Admin Login', 'Admin logged in successfully']);

    res.json({ 
      token, 
      admin: { 
        id: admin.id, 
        username: admin.username, 
        email: admin.email, 
        phone: admin.phone 
      } 
    });
  });
});

// Middleware to verify admin token
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.admin = decoded;
    next();
  });
}

// Create User Account
app.post('/api/admin/users', verifyAdmin, (req, res) => {
  const { full_name, email, phone, bank_name, account_type } = req.body;
  const account_number = generateAccountNumber();
  const wallet_address = generateWalletAddress();

  db.run(`INSERT INTO users (account_number, full_name, email, phone, bank_name, account_type, wallet_address, created_by) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [account_number, full_name, email, phone, bank_name, account_type, wallet_address, req.admin.adminId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error creating user account' });
      }

      // Log activity
      db.run('INSERT INTO activity_logs (admin_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [req.admin.adminId, this.lastID, 'Create User', `Created account for ${full_name}`]);

      // Send email notification
      sendEmailNotification(email, 'Account Created', 
        `Your account has been created successfully!\n\nAccount Number: ${account_number}\nWallet Address: ${wallet_address}\nInitial Balance: ₦0.00\n\nWelcome to Global Bank!`);

      res.json({ 
        message: 'User account created successfully',
        user: {
          id: this.lastID,
          account_number,
          wallet_address,
          full_name,
          email,
          phone,
          bank_name,
          balance: 0.0
        }
      });
    });
});

// Get All Users
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  db.all('SELECT * FROM users ORDER BY created_at DESC', [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching users' });
    }
    res.json(users);
  });
});

// Deactivate User
app.put('/api/admin/users/:id/deactivate', verifyAdmin, (req, res) => {
  db.run('UPDATE users SET status = ? WHERE id = ?', ['inactive', req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error deactivating user' });
    }

    // Log activity
    db.run('INSERT INTO activity_logs (admin_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [req.admin.adminId, req.params.id, 'Deactivate User', `Deactivated user ID: ${req.params.id}`]);

    res.json({ message: 'User deactivated successfully' });
  });
});

// Activate User
app.put('/api/admin/users/:id/activate', verifyAdmin, (req, res) => {
  db.run('UPDATE users SET status = ? WHERE id = ?', ['active', req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error activating user' });
    }

    // Log activity
    db.run('INSERT INTO activity_logs (admin_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [req.admin.adminId, req.params.id, 'Activate User', `Activated user ID: ${req.params.id}`]);

    res.json({ message: 'User activated successfully' });
  });
});

// Credit User Account
app.post('/api/admin/users/:id/credit', verifyAdmin, (req, res) => {
  const { amount, description } = req.body;
  
  db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error crediting account' });
    }

    // Get user details
    db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'Error fetching user details' });
      }

      // Record transaction
      db.run(`INSERT INTO transactions (user_id, transaction_type, amount, receiver_account, receiver_name, bank_name, wallet_address, description) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, 'credit', amount, user.account_number, user.full_name, user.bank_name, user.wallet_address, description || 'Admin credit']);

      // Log activity
      db.run('INSERT INTO activity_logs (admin_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [req.admin.adminId, req.params.id, 'Credit Account', `Credited ₦${amount} to ${user.full_name}`]);

      // Send notification
      sendEmailNotification(user.email, 'Account Credit Alert', 
        `Your account has been credited with ₦${amount}\n\nDescription: ${description || 'Admin credit'}\nNew Balance: ₦${user.balance + amount}\n\nThank you for banking with Global Bank!`);

      res.json({ message: 'Account credited successfully', new_balance: user.balance + amount });
    });
  });
});

// Debit User Account
app.post('/api/admin/users/:id/debit', verifyAdmin, (req, res) => {
  const { amount, description } = req.body;
  
  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error debiting account' });
    }

    // Get user details
    db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, user) => {
      if (err || !user) {
        return res.status(500).json({ error: 'Error fetching user details' });
      }

      // Record transaction
      db.run(`INSERT INTO transactions (user_id, transaction_type, amount, sender_account, sender_name, bank_name, wallet_address, description) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, 'debit', amount, user.account_number, user.full_name, user.bank_name, user.wallet_address, description || 'Admin debit']);

      // Log activity
      db.run('INSERT INTO activity_logs (admin_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [req.admin.adminId, req.params.id, 'Debit Account', `Debited ₦${amount} from ${user.full_name}`]);

      // Send notification
      sendEmailNotification(user.email, 'Account Debit Alert', 
        `Your account has been debited with ₦${amount}\n\nDescription: ${description || 'Admin debit'}\nNew Balance: ₦${user.balance - amount}\n\nIf you did not authorize this transaction, please contact us immediately.`);

      res.json({ message: 'Account debited successfully', new_balance: user.balance - amount });
    });
  });
});

// Send Money
app.post('/api/users/:id/transfer', (req, res) => {
  const { sender_account, receiver_account, amount, bank_name, description } = req.body;
  
  // Get sender details
  db.get('SELECT * FROM users WHERE account_number = ?', [sender_account], (err, sender) => {
    if (err || !sender) {
      return res.status(404).json({ error: 'Sender account not found' });
    }

    if (sender.status !== 'active') {
      return res.status(403).json({ error: 'Sender account is inactive' });
    }

    if (sender.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Check if receiver is internal or external
    db.get('SELECT * FROM users WHERE account_number = ?', [receiver_account], (err, receiver) => {
      if (receiver) {
        // Internal transfer
        db.serialize(() => {
          db.run('UPDATE users SET balance = balance - ? WHERE account_number = ?', [amount, sender_account]);
          db.run('UPDATE users SET balance = balance + ? WHERE account_number = ?', [amount, receiver_account]);

          // Record sender transaction
          db.run(`INSERT INTO transactions (user_id, transaction_type, amount, sender_account, receiver_account, sender_name, receiver_name, bank_name, wallet_address, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sender.id, 'debit', amount, sender_account, receiver_account, sender.full_name, receiver.full_name, receiver.bank_name, sender.wallet_address, description || 'Transfer']);

          // Record receiver transaction
          db.run(`INSERT INTO transactions (user_id, transaction_type, amount, sender_account, receiver_account, sender_name, receiver_name, bank_name, wallet_address, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [receiver.id, 'credit', amount, sender_account, receiver_account, sender.full_name, receiver.full_name, receiver.bank_name, receiver.wallet_address, description || 'Transfer']);

          // Send notifications
          sendEmailNotification(sender.email, 'Transfer Successful', 
            `You have transferred ₦${amount} to ${receiver.full_name} (${receiver_account})\n\nDescription: ${description || 'Transfer'}\nNew Balance: ₦${sender.balance - amount}\n\nThank you for banking with Global Bank!`);

          sendEmailNotification(receiver.email, 'Money Received', 
            `You have received ₦${amount} from ${sender.full_name} (${sender_account})\n\nDescription: ${description || 'Transfer'}\nNew Balance: ₦${receiver.balance + amount}\n\nThank you for banking with Global Bank!`);

          res.json({ message: 'Transfer successful', new_balance: sender.balance - amount });
        });
      } else {
        // External transfer (simplified - in real system, integrate with bank APIs)
        db.run('UPDATE users SET balance = balance - ? WHERE account_number = ?', [amount, sender_account], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Error processing transfer' });
          }

          // Record transaction
          db.run(`INSERT INTO transactions (user_id, transaction_type, amount, sender_account, receiver_account, sender_name, bank_name, wallet_address, description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sender.id, 'debit', amount, sender_account, receiver_account, sender.full_name, bank_name || 'External Bank', sender.wallet_address, description || 'External transfer']);

          // Send notification
          sendEmailNotification(sender.email, 'Transfer Successful', 
            `You have transferred ₦${amount} to ${receiver_account} at ${bank_name || 'External Bank'}\n\nDescription: ${description || 'External transfer'}\nNew Balance: ₦${sender.balance - amount}\n\nThank you for banking with Global Bank!`);

          res.json({ message: 'Transfer successful', new_balance: sender.balance - amount });
        });
      }
    });
  });
});

// Get User Transactions
app.get('/api/users/:id/transactions', (req, res) => {
  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC LIMIT 50', 
    [req.params.id], (err, transactions) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching transactions' });
    }
    res.json(transactions);
  });
});

// Get User Balance
app.get('/api/users/:id/balance', (req, res) => {
  db.get('SELECT balance FROM users WHERE id = ?', [req.params.id], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ balance: user.balance });
  });
});

// Get Activity Logs
app.get('/api/admin/logs', verifyAdmin, (req, res) => {
  db.all(`SELECT al.*, a.username as admin_name, u.full_name as user_name 
    FROM activity_logs al 
    LEFT JOIN admins a ON al.admin_id = a.id 
    LEFT JOIN users u ON al.user_id = u.id 
    ORDER BY al.timestamp DESC LIMIT 100`, [], (err, logs) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching logs' });
    }
    res.json(logs);
  });
});

// Send Email Notification
function sendEmailNotification(to, subject, text) {
  const mailOptions = {
    from: 'globalbank.noreply@gmail.com',
    to: to,
    subject: subject,
    text: text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email error:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

// Wallet Mining - Every 5 minutes
cron.schedule('*/5 * * * *', () => {
  console.log('Running wallet mining...');
  
  db.all('SELECT * FROM users WHERE status = ?', ['active'], (err, users) => {
    if (err) {
      console.error('Error fetching users for mining:', err);
      return;
    }

    users.forEach(user => {
      const miningAmount = 150000.00; // ₦150,000

      db.serialize(() => {
        // Update user balance
        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [miningAmount, user.id]);

        // Record mining transaction
        db.run(`INSERT INTO transactions (user_id, transaction_type, amount, receiver_account, receiver_name, bank_name, wallet_address, description) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [user.id, 'mining', miningAmount, user.account_number, user.full_name, user.bank_name, user.wallet_address, 'Wallet mining reward']);

        // Record mining activity
        db.run(`INSERT INTO wallet_mining (user_id, wallet_address, amount_mined) VALUES (?, ?, ?)`,
          [user.id, user.wallet_address, miningAmount]);

        // Send notification
        sendEmailNotification(user.email, 'Mining Reward Received', 
          `Congratulations! Your wallet has mined ₦${miningAmount.toFixed(2)}\n\nWallet Address: ${user.wallet_address}\nNew Balance: ₦${user.balance + miningAmount}\n\nThank you for using Global Bank!`);
      });
    });

    console.log(`Mining completed for ${users.length} users`);
  });
});

// Dashboard Statistics
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as total_users, SUM(balance) as total_balance FROM users', [], (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching statistics' });
    }
    res.json(stats);
  });
});

app.listen(PORT, () => {
  console.log(`Global Bank Server running on port ${PORT}`);
  console.log('Admin Login - Username: admin, Password: admin123');
});