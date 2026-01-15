// Global variables
let currentUser = null;
let adminToken = localStorage.getItem('adminToken');
const API_BASE = 'http://localhost:5000/api';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        showAdminDashboard();
    }
    
    // Login form handler
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);
    document.getElementById('transferForm').addEventListener('submit', handleTransfer);
    document.getElementById('creditDebitForm').addEventListener('submit', handleCreditDebit);
    
    // Start mining timer
    startMiningTimer();
});

// Login handler
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            showAdminDashboard();
            showAdminInfo(data.admin);
        } else {
            showLoginAlert(data.error, 'error');
        }
    } catch (error) {
        showLoginAlert('Connection error. Please try again.', 'error');
    }
}

function showLoginAlert(message, type) {
    const alertDiv = document.getElementById('loginAlert');
    alertDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => alertDiv.innerHTML = '', 5000);
}

function showAdminInfo(admin) {
    document.getElementById('userName').textContent = admin.username;
    document.getElementById('userInfo').style.display = 'flex';
}

function showAdminDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('userWallet').style.display = 'none';
    
    loadDashboardStats();
    loadUsers();
}

// Dashboard statistics
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const data = await response.json();
        document.getElementById('totalUsers').textContent = data.total_users || 0;
        document.getElementById('totalBalance').textContent = `₦${(data.total_balance || 0).toLocaleString()}`;
        document.getElementById('activeUsers').textContent = data.total_users || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Show sections
function showSection(section) {
    // Hide all sections
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('usersSection').style.display = 'none';
    document.getElementById('transactionsSection').style.display = 'none';
    document.getElementById('logsSection').style.display = 'none';
    
    // Remove active class from all sidebar items
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    
    // Show selected section
    document.getElementById(`${section}Section`).style.display = 'block';
    event.target.classList.add('active');
    
    // Load section data
    if (section === 'users') {
        loadUsers();
    } else if (section === 'transactions') {
        loadTransactions();
    } else if (section === 'logs') {
        loadLogs();
    } else if (section === 'dashboard') {
        loadDashboardStats();
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const users = await response.json();
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.account_number}</td>
                <td>${user.full_name}</td>
                <td>${user.email}</td>
                <td>${user.bank_name}</td>
                <td>₦${user.balance.toLocaleString()}</td>
                <td><span class="badge ${user.status === 'active' ? 'badge-success' : 'badge-danger'}">${user.status}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="showUserWallet(${user.id})">View Wallet</button>
                    <button class="btn btn-success" style="padding: 5px 10px; font-size: 12px;" onclick="openCreditModal(${user.id})">Credit</button>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;" onclick="openDebitModal(${user.id})">Debit</button>
                    <button class="btn btn-warning" style="padding: 5px 10px; font-size: 12px;" onclick="toggleUserStatus(${user.id}, '${user.status}')">${user.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Create user
async function handleCreateUser(e) {
    e.preventDefault();
    
    const userData = {
        full_name: document.getElementById('newFullName').value,
        email: document.getElementById('newEmail').value,
        phone: document.getElementById('newPhone').value,
        bank_name: document.getElementById('newBankName').value,
        account_type: document.getElementById('newAccountType').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('User account created successfully!');
            closeModal('createUserModal');
            document.getElementById('createUserForm').reset();
            loadUsers();
        } else {
            alert(data.error || 'Error creating user');
        }
    } catch (error) {
        alert('Error creating user account');
    }
}

// Show user wallet
async function showUserWallet(userId) {
    try {
        // Get user details
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const users = await response.json();
        const user = users.find(u => u.id === userId);
        
        if (user) {
            currentUser = user;
            document.getElementById('adminDashboard').style.display = 'none';
            document.getElementById('userWallet').style.display = 'block';
            document.getElementById('userBalance').textContent = `₦${user.balance.toLocaleString()}`;
            document.getElementById('userWalletAddress').textContent = `Wallet Address: ${user.wallet_address}`;
            document.getElementById('returnToDashboardBtn').style.display = 'block';
            
            loadUserTransactions(userId);
        }
    } catch (error) {
        console.error('Error loading user wallet:', error);
    }
}

// Load user transactions
async function loadUserTransactions(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/transactions`);
        const transactions = await response.json();
        
        const tbody = document.querySelector('#userTransactionsTable tbody');
        tbody.innerHTML = '';
        
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const date = new Date(tx.transaction_date);
            row.innerHTML = `
                <td>${date.toLocaleString()}</td>
                <td><span class="transaction-type ${tx.transaction_type}">${tx.transaction_type}</span></td>
                <td style="color: ${tx.transaction_type === 'credit' || tx.transaction_type === 'mining' ? 'green' : 'red'}">
                    ${tx.transaction_type === 'credit' || tx.transaction_type === 'mining' ? '+' : '-'}₦${tx.amount.toLocaleString()}
                </td>
                <td>${tx.description || '-'}</td>
                <td><span class="badge badge-success">${tx.status}</span></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Load all transactions
async function loadTransactions() {
    try {
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const users = await response.json();
        
        // Get transactions for all users
        let allTransactions = [];
        for (const user of users) {
            const txResponse = await fetch(`${API_BASE}/users/${user.id}/transactions`);
            const transactions = await txResponse.json();
            allTransactions = allTransactions.concat(transactions);
        }
        
        // Sort by date
        allTransactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
        
        const tbody = document.querySelector('#transactionsTable tbody');
        tbody.innerHTML = '';
        
        allTransactions.slice(0, 50).forEach(tx => {
            const date = new Date(tx.transaction_date);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${date.toLocaleString()}</td>
                <td><span class="transaction-type ${tx.transaction_type}">${tx.transaction_type}</span></td>
                <td>₦${tx.amount.toLocaleString()}</td>
                <td>${tx.sender_name || '-'}</td>
                <td>${tx.receiver_name || '-'}</td>
                <td>${tx.bank_name || '-'}</td>
                <td>${tx.description || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Load activity logs
async function loadLogs() {
    try {
        const response = await fetch(`${API_BASE}/admin/logs`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const logs = await response.json();
        const tbody = document.querySelector('#logsTable tbody');
        tbody.innerHTML = '';
        
        logs.forEach(log => {
            const timestamp = new Date(log.timestamp);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${timestamp.toLocaleString()}</td>
                <td>${log.admin_name || '-'}</td>
                <td>${log.user_name || '-'}</td>
                <td><strong>${log.action}</strong></td>
                <td>${log.details || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Toggle user status
async function toggleUserStatus(userId, currentStatus) {
    const action = currentStatus === 'active' ? 'deactivate' : 'activate';
    
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}/${action}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            alert(`User ${action}d successfully`);
            loadUsers();
        } else {
            alert(`Error ${action}ing user`);
        }
    } catch (error) {
        alert(`Error ${action}ing user`);
    }
}

// Credit user
async function handleCreditDebit(e) {
    e.preventDefault();
    
    const type = document.getElementById('creditDebitType').value;
    const userId = document.getElementById('creditDebitUserId').value;
    const amount = parseFloat(document.getElementById('creditDebitAmount').value);
    const description = document.getElementById('creditDebitDescription').value;
    
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ amount, description })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(data.message);
            closeModal('creditDebitModal');
            document.getElementById('creditDebitForm').reset();
            loadUsers();
            if (currentUser && currentUser.id == userId) {
                document.getElementById('userBalance').textContent = `₦${data.new_balance.toLocaleString()}`;
            }
        } else {
            alert(data.error || 'Error processing transaction');
        }
    } catch (error) {
        alert('Error processing transaction');
    }
}

// Transfer money
async function handleTransfer(e) {
    e.preventDefault();
    
    const transferData = {
        sender_account: document.getElementById('senderAccount').value,
        receiver_account: document.getElementById('receiverAccount').value,
        bank_name: document.getElementById('transferBankName').value,
        amount: parseFloat(document.getElementById('transferAmount').value),
        description: document.getElementById('transferDescription').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transferData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Transfer successful!');
            closeModal('transferModal');
            document.getElementById('transferForm').reset();
            
            // Update balance and transactions
            document.getElementById('userBalance').textContent = `₦${data.new_balance.toLocaleString()}`;
            loadUserTransactions(currentUser.id);
        } else {
            alert(data.error || 'Error processing transfer');
        }
    } catch (error) {
        alert('Error processing transfer');
    }
}

// Modal functions
function openCreateUserModal() {
    document.getElementById('createUserModal').classList.add('active');
}

function openTransferModal() {
    document.getElementById('senderAccount').value = currentUser.account_number;
    document.getElementById('transferModal').classList.add('active');
}

function openReceiveModal() {
    alert(`To receive money, share these details:\n\nAccount Number: ${currentUser.account_number}\nBank Name: ${currentUser.bank_name}\nAccount Name: ${currentUser.full_name}`);
}

function openCreditModal(userId) {
    document.getElementById('creditDebitType').value = 'credit';
    document.getElementById('creditDebitUserId').value = userId;
    document.getElementById('creditDebitTitle').textContent = 'Credit Account';
    document.getElementById('creditDebitModal').classList.add('active');
}

function openDebitModal(userId) {
    document.getElementById('creditDebitType').value = 'debit';
    document.getElementById('creditDebitUserId').value = userId;
    document.getElementById('creditDebitTitle').textContent = 'Debit Account';
    document.getElementById('creditDebitModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Mining timer
function startMiningTimer() {
    let minutes = 5;
    let seconds = 0;
    
    setInterval(() => {
        seconds--;
        if (seconds < 0) {
            seconds = 59;
            minutes--;
        }
        
        if (minutes < 0) {
            minutes = 4;
            seconds = 59;
        }
        
        document.getElementById('miningTimer').textContent = 
            `Next reward in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Logout
function logout() {
    localStorage.removeItem('adminToken');
    adminToken = null;
    currentUser = null;
    
    document.getElementById('loginPage').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('userWallet').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('loginForm').reset();
}

// Return to admin dashboard
function returnToDashboard() {
    document.getElementById('adminDashboard').style.display = 'block';
    document.getElementById('userWallet').style.display = 'none';
    document.getElementById('returnToDashboardBtn').style.display = 'none';
    currentUser = null;
    loadUsers();
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}