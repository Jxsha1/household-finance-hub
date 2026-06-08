CREATE TABLE households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    budget_mode TEXT DEFAULT 'cash_flow',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    allocated_amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE debts (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    debt_name TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    current_balance INTEGER NOT NULL,
    interest_rate REAL NOT NULL,
    FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (household_id) REFERENCES households(id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
