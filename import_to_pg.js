const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const importData = async () => {
  const data = JSON.parse(fs.readFileSync('dump_data.json', 'utf8'));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Ensure tables exist
    console.log('Ensuring tables exist...');
    await client.query(`CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'Hoạt động'
    )`);
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
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'Khách hàng',
      status TEXT DEFAULT 'Hoạt động'
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      date TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT DEFAULT 'Đang xử lý'
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL
    )`);

    // 1. Import Categories
    console.log('Importing categories...');
    for (const cat of data.categories) {
      await client.query(
        'INSERT INTO categories (id, name, description, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [cat.id, cat.name, cat.description, cat.status]
      );
    }

    // 2. Import Products
    console.log('Importing products...');
    for (const prod of data.products) {
      await client.query(
        'INSERT INTO products (id, name, category_id, price, stock, status, image_url, discount, unit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING',
        [prod.id, prod.name, prod.category_id, prod.price, prod.stock, prod.status, prod.image_url, prod.discount, prod.unit]
      );
    }

    // 3. Import Users
    console.log('Importing users...');
    for (const user of data.users) {
      await client.query(
        'INSERT INTO users (id, name, email, phone, password, role, status) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
        [user.id, user.name, user.email, user.phone, user.password, user.role, user.status]
      );
    }

    // Update sequences for SERIAL columns
    console.log('Updating sequences...');
    await client.query("SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories))");
    await client.query("SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))");
    await client.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");

    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during migration:', err);
  } finally {
    client.release();
    pool.end();
  }
};

importData();
