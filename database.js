const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Khởi tạo các bảng
    db.serialize(() => {
      // Bảng Users
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT UNIQUE,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'Khách hàng',
        status TEXT DEFAULT 'Hoạt động'
      )`);

      // Thêm cột phone nếu chưa có
      db.run(`ALTER TABLE users ADD COLUMN phone TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding phone column:', err.message);
        }
      });

      // Bảng Categories
      db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'Hoạt động'
      )`);

      // Bảng Products
      db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER,
        price INTEGER NOT NULL,
        stock INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Còn hàng',
        image_url TEXT,
        discount INTEGER DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      )`);

      // Kiểm tra và thêm cột discount nếu chưa có (cho database đã tồn tại)
      db.run(`ALTER TABLE products ADD COLUMN discount INTEGER DEFAULT 0`, (err) => {
        if (err) {
          if (!err.message.includes('duplicate column name')) {
            console.log('Thông báo: Cột discount đã tồn tại hoặc có lỗi không đáng kể.');
          }
        }
      });

      // Kiểm tra và thêm cột image_url nếu chưa có (cho database đã tồn tại)
      db.run(`ALTER TABLE products ADD COLUMN image_url TEXT`, (err) => {
        if (err) {
          // Lỗi này thường là do cột đã tồn tại, có thể bỏ qua
          if (!err.message.includes('duplicate column name')) {
            console.log('Thông báo: Cột image_url đã tồn tại hoặc có lỗi không đáng kể.');
          }
        }
      });

      // Thêm cột unit (đơn vị tính) nếu chưa có
      db.run(`ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'Cái'`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding unit column:', err.message);
        }
      });

      // Bảng Orders
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        date TEXT NOT NULL,
        total INTEGER NOT NULL,
        status TEXT DEFAULT 'Đang xử lý'
      )`);

      // Bảng Order Items (Chi tiết đơn hàng)
      db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
      )`);

      // Bảng Inventory (Nhập hàng)
      db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        supplier TEXT NOT NULL,
        total INTEGER NOT NULL,
        status TEXT DEFAULT 'Hoàn thành'
      )`);

      // Bảng Inventory Items (Chi tiết nhập hàng)
      db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_id TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price INTEGER NOT NULL,
        FOREIGN KEY (inventory_id) REFERENCES inventory (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
      )`);

      // Bảng Disposals (Hủy hàng / Đổi trả)
      db.run(`CREATE TABLE IF NOT EXISTS disposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'Hủy' hoặc 'Đổi trả'
        reason TEXT,
        cost INTEGER DEFAULT 0,
        date TEXT NOT NULL,
        staff_name TEXT,
        FOREIGN KEY (product_id) REFERENCES products (id)
      )`);
    });
  }
});

module.exports = db;
