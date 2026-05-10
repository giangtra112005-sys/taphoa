const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Wrapper to mimic SQLite API for minimal changes in index.js
const db = {
  all: (query, ...args) => {
    let callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    
    let index = 1;
    const pgQuery = query.replace(/\?/g, () => `$${index++}`);
    pool.query(pgQuery, params)
      .then(res => callback(null, res.rows))
      .catch(err => callback(err));
  },
  get: (query, ...args) => {
    let callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    
    let index = 1;
    const pgQuery = query.replace(/\?/g, () => `$${index++}`);
    pool.query(pgQuery, params)
      .then(res => callback(null, res.rows[0]))
      .catch(err => callback(err));
  },
  run: (query, ...args) => {
    let callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    
    let index = 1;
    const pgQuery = query.replace(/\?/g, () => `$${index++}`);
    pool.query(pgQuery, params)
      .then(res => {
        if (callback) callback.call({ lastID: null, changes: res.rowCount }, null);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  },
  // For SQLite's db.serialize and specific schema logic
  serialize: (fn) => fn(),
  prepare: (query) => {
    return {
      run: (...args) => {
        db.run(query, ...args);
      },
      finalize: () => {}
    };
  }
};

// Khởi tạo bảng nếu chưa có
const initDb = async () => {
  try {
    const client = await pool.connect();
    
    // Bảng Users
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'Khách hàng',
      status TEXT DEFAULT 'Hoạt động'
    )`);

    // Bảng Categories
    await client.query(`CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'Hoạt động'
    )`);

    // Bảng Products
    await client.query(`CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      price INTEGER NOT NULL,
      stock INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Còn hàng',
      image_url TEXT,
      discount INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'Cái'
    )`);

    // Bảng Orders
    await client.query(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      date TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT DEFAULT 'Đang xử lý'
    )`);

    // Bảng Order Items
    await client.query(`CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL
    )`);

    // Bảng Inventory
    await client.query(`CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      supplier TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT DEFAULT 'Hoàn thành'
    )`);

    // Bảng Inventory Items
    await client.query(`CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      inventory_id TEXT REFERENCES inventory(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL
    )`);

    // Bảng Disposals
    await client.query(`CREATE TABLE IF NOT EXISTS disposals (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      cost INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      staff_name TEXT
    )`);

    console.log('PostgreSQL initialized successfully.');
    client.release();
  } catch (err) {
    console.error('Error initializing PostgreSQL:', err);
  }
};

initDb();

module.exports = db;
