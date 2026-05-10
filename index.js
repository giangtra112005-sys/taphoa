require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
const moment = require('moment');
const qs = require('qs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// VNPay Configuration
const vnp_TmnCode = "N7YJ5E7A";
const vnp_HashSecret = process.env.VN_HASH_SECRET;
const vnp_Url = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const vnp_ReturnUrl = "https://banhangtaphoa.gt.tc/payment-result"; 

// Thay thế bằng Client ID thực tế của bạn
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files from 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Cấu hình Multer để lưu file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// API upload ảnh
app.post('/api/upload', upload.single('image'), (req, res) => {
  console.log('Nhận yêu cầu tải lên ảnh...');
  if (!req.file) {
    console.log('Lỗi: Không tìm thấy file trong yêu cầu.');
    return res.status(400).json({ error: 'Không có file nào được tải lên.' });
  }
  const imageUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  console.log('Tải lên thành công:', imageUrl);
  res.json({ imageUrl });
});

// ================= USERS API =================
app.get('/api/users', (req, res) => {
  const query = `
    SELECT id, name, email, phone, 
    CASE 
      WHEN role IN ('Admin', 'Nhân viên') THEN password 
      ELSE '********' 
    END as password, 
    role, status 
    FROM users
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', (req, res) => {
  const { name, email, phone, password, role, status } = req.body;
  db.run('INSERT INTO users (name, email, phone, password, role, status) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, phone, password || '123456', role || 'Nhân viên', status || 'Hoạt động'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, email, phone, role, status });
    });
});

app.put('/api/users/:id', (req, res) => {
  const { name, email, password, role, status } = req.body;
  if (password) {
    db.run('UPDATE users SET name = ?, email = ?, phone = ?, password = ?, role = ?, status = ? WHERE id = ?',
      [name, email, phone, password, role, status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: req.params.id, name, email, phone, role, status });
      });
  } else {
    // Không cập nhật mật khẩu nếu trống
    db.run('UPDATE users SET name = ?, email = ?, phone = ?, role = ?, status = ? WHERE id = ?',
      [name, email, phone, role, status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: req.params.id, name, email, phone, role, status });
      });
  }
});

app.delete('/api/users/:id', (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ================= AUTH API =================
app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body; // identifier can be email or phone
  db.get('SELECT id, name, email, phone, role, status FROM users WHERE (email = ? OR phone = ?) AND password = ?',
    [identifier, identifier, password], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(401).json({ error: 'Thông tin đăng nhập hoặc mật khẩu không đúng' });
      if (row.status !== 'Hoạt động') return res.status(403).json({ error: 'Tài khoản đã bị khóa' });

      res.json(row);
    });
});

app.post('/api/google-login', async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Kiểm tra xem người dùng đã tồn tại chưa
    db.get('SELECT id, name, email, phone, role, status FROM users WHERE email = ?', [email], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      if (row) {
        // Người dùng đã tồn tại, kiểm tra trạng thái
        if (row.status !== 'Hoạt động') return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
        res.json(row);
      } else {
        // Người dùng chưa tồn tại, tạo mới với mật khẩu ngẫu nhiên (không dùng để đăng nhập)
        const randomPassword = Math.random().toString(36).slice(-8);
        db.run('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
          [name, email, randomPassword, 'Khách hàng', 'Hoạt động'], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, name, email, role: 'Khách hàng', status: 'Hoạt động' });
          });
      }
    });
  } catch (error) {
    console.error('Lỗi xác thực Google:', error);
    res.status(401).json({ error: 'Xác thực Google thất bại' });
  }
});

app.post('/api/register', (req, res) => {
  const { name, phone, password } = req.body;

  // Kiểm tra số điện thoại đã tồn tại chưa
  db.get('SELECT id FROM users WHERE phone = ?', [phone], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: 'Số điện thoại này đã được đăng ký' });

    // Đăng ký mới
    db.run('INSERT INTO users (name, phone, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [name, phone, password, 'Khách hàng', 'Hoạt động'], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, phone, role: 'Khách hàng', status: 'Hoạt động' });
      });
  });
});

// ================= CATEGORIES API =================
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/categories', (req, res) => {
  const { name, description, status } = req.body;
  db.run('INSERT INTO categories (name, description, status) VALUES (?, ?, ?)',
    [name, description, status || 'Hoạt động'], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, description, status: status || 'Hoạt động' });
    });
});

app.put('/api/categories/:id', (req, res) => {
  const { name, description, status } = req.body;
  db.run('UPDATE categories SET name = ?, description = ?, status = ? WHERE id = ?',
    [name, description, status, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, name, description, status });
    });
});

app.delete('/api/categories/:id', (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ================= PRODUCTS API =================
app.get('/api/products', (req, res) => {
  const query = `
    SELECT p.*, c.name as category 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/products', (req, res) => {
  const { name, category_id, price, stock, status, image_url, discount, unit } = req.body;
  db.run('INSERT INTO products (name, category_id, price, stock, status, image_url, discount, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, category_id, price, stock || 0, status || 'Còn hàng', image_url, discount || 0, unit || 'Cái'], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, category_id, price, stock: stock || 0, status: status || 'Còn hàng', image_url, discount: discount || 0, unit: unit || 'Cái' });
    });
});

app.put('/api/products/:id', (req, res) => {
  const { name, category_id, price, stock, status, image_url, discount, unit } = req.body;
  db.run('UPDATE products SET name = ?, category_id = ?, price = ?, stock = ?, status = ?, image_url = ?, discount = ?, unit = ? WHERE id = ?',
    [name, category_id, price, stock, status, image_url, discount || 0, unit || 'Cái', req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, name, category_id, price, stock, status, image_url, discount: discount || 0, unit: unit || 'Cái' });
    });
});

app.put('/api/products/reset/discounts', (req, res) => {
  db.run('UPDATE products SET discount = 0', function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', req.params.id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ================= INVENTORY API =================
app.get('/api/inventory', (req, res) => {
  db.all('SELECT * FROM inventory ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/inventory/:id/items', (req, res) => {
  db.all('SELECT * FROM inventory_items WHERE inventory_id = ?', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/inventory', (req, res) => {
  const { id, date, supplier, total, status, items } = req.body;
  const finalStatus = status || 'Hoàn thành';

  db.run('INSERT INTO inventory (id, date, supplier, total, status) VALUES (?, ?, ?, ?, ?)',
    [id, date, supplier, total, finalStatus], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Lưu chi tiết nhập hàng
      if (items && items.length > 0) {
        const stmt = db.prepare('INSERT INTO inventory_items (inventory_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)');
        
        // Chỉ cập nhật tồn kho nếu trạng thái là Hoàn thành
        const updateStockStmt = finalStatus === 'Hoàn thành' ? db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?') : null;

        items.forEach(item => {
          stmt.run(id, item.product_id, item.product_name, item.quantity, item.price);
          if (updateStockStmt) {
            updateStockStmt.run(item.quantity, item.product_id);
          }
        });

        stmt.finalize();
        if (updateStockStmt) updateStockStmt.finalize();
      }

      res.json({ id, date, supplier, total, status: finalStatus });
    });
});

app.put('/api/inventory/:id/status', (req, res) => {
  const { status } = req.body;
  const receiptId = req.params.id;

  // Lấy thông tin phiếu nhập hiện tại để kiểm tra trạng thái cũ
  db.get('SELECT status FROM inventory WHERE id = ?', [receiptId], (err, receipt) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!receipt) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });

    const oldStatus = receipt.status;

    db.run('UPDATE inventory SET status = ? WHERE id = ?', [status, receiptId], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Nếu chuyển từ 'Chờ duyệt' sang 'Hoàn thành', thực hiện cộng tồn kho
      if (status === 'Hoàn thành' && oldStatus === 'Chờ duyệt') {
        db.all('SELECT product_id, quantity FROM inventory_items WHERE inventory_id = ?', [receiptId], (err, items) => {
          if (!err && items) {
            const updateStockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
            items.forEach(item => {
              updateStockStmt.run(item.quantity, item.product_id);
            });
            updateStockStmt.finalize();
          }
        });
      }

      res.json({ id: receiptId, status });
    });
  });
});

// ================= ORDERS API =================
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/orders', (req, res) => {
  const { id, customer_name, date, total, status, items } = req.body;

  // Lưu thông tin đơn hàng chính
  db.run('INSERT INTO orders (id, customer_name, date, total, status) VALUES (?, ?, ?, ?, ?)',
    [id, customer_name, date, total, status || 'Hoàn thành'], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Lưu các sản phẩm trong đơn hàng nếu có
      if (items && items.length > 0) {
        const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)');
        const updateStockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

        items.forEach(item => {
          stmt.run(id, item.id, item.name, item.price, item.quantity);
          // Chỉ trừ tồn kho nếu đơn hàng ở trạng thái Hoàn thành
          if ((status || 'Hoàn thành') === 'Hoàn thành') {
            updateStockStmt.run(item.quantity, item.id);
          }
        });

        stmt.finalize();
        updateStockStmt.finalize();
      }

      res.json({ id, customer_name, date, total, status: status || 'Hoàn thành' });
    });
});

app.get('/api/orders/:id/items', (req, res) => {
  const orderId = req.params.id;
  db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  // Lấy thông tin đơn hàng hiện tại để kiểm tra trạng thái cũ
  db.get('SELECT status FROM orders WHERE id = ?', [orderId], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const oldStatus = order.status;

    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Nếu trạng thái mới là 'Đã hủy' và trạng thái cũ là 'Hoàn thành' hoặc 'Đã giao', hoàn lại tồn kho
      if (status === 'Đã hủy' && (oldStatus === 'Hoàn thành' || oldStatus === 'Đã giao')) {
        db.all('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId], (err, items) => {
          if (!err && items) {
            const updateStockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
            items.forEach(item => {
              updateStockStmt.run(item.quantity, item.product_id);
            });
            updateStockStmt.finalize();
          }
        });
      }

      res.json({ id: orderId, status });
    });
  });
});

// ================= VNPAY API =================
app.post('/api/create_payment_url', (req, res) => {
    const date = new Date();
    const createDate = moment(date).format('YYYYMMDDHHmmss');
    
    const ipAddr = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    const tmnCode = vnp_TmnCode;
    const secretKey = vnp_HashSecret;
    let vnpUrl = vnp_Url;
    const returnUrl = vnp_ReturnUrl;

    const orderId = req.body.orderId;
    const amount = req.body.amount;
    const bankCode = req.body.bankCode || '';
    
    let locale = req.body.language;
    if(locale === null || locale === '' || locale === undefined){
        locale = 'vn';
    }
    const currCode = 'VND';
    let vnp_Params = {};
    vnp_Params['vnp_Version'] = '2.1.0';
    vnp_Params['vnp_Command'] = 'pay';
    vnp_Params['vnp_TmnCode'] = tmnCode;
    vnp_Params['vnp_Locale'] = locale;
    vnp_Params['vnp_CurrCode'] = currCode;
    vnp_Params['vnp_TxnRef'] = orderId;
    vnp_Params['vnp_OrderInfo'] = 'Thanh toan cho ma don hang:' + orderId;
    vnp_Params['vnp_OrderType'] = 'other';
    vnp_Params['vnp_Amount'] = amount * 100;
    vnp_Params['vnp_ReturnUrl'] = returnUrl;
    vnp_Params['vnp_IpAddr'] = ipAddr;
    vnp_Params['vnp_CreateDate'] = createDate;
    if(bankCode !== null && bankCode !== ''){
        vnp_Params['vnp_BankCode'] = bankCode;
    }

    vnp_Params = sortObject(vnp_Params);

    const signData = qs.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac("sha512", secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); 
    vnp_Params['vnp_SecureHash'] = signed;
    vnpUrl += '?' + qs.stringify(vnp_Params, { encode: false });

    res.json({ paymentUrl: vnpUrl });
});

app.get('/api/vnpay_return', (req, res) => {
    let vnp_Params = req.query;
    const secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params);

    const secretKey = vnp_HashSecret;
    const signData = qs.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac("sha512", secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");     

    if(secureHash === signed){
        // Kiem tra xem du lieu trong db co hop le hay khong va thong bao ket qua
        const orderId = vnp_Params['vnp_TxnRef'];
        const responseCode = vnp_Params['vnp_ResponseCode'];
        
        if (responseCode === "00") {
          // Thanh toan thanh cong, cap nhat trang thai don hang
          db.run('UPDATE orders SET status = ? WHERE id = ?', ['Hoàn thành', orderId], (err) => {
            if (err) {
              console.error('Error updating order status:', err);
            } else {
              // Sau khi cập nhật trạng thái đơn hàng thành công, trừ tồn kho
              db.all('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId], (err, items) => {
                if (err) {
                  console.error('Error fetching order items for stock update:', err);
                } else {
                  const updateStockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
                  items.forEach(item => {
                    updateStockStmt.run(item.quantity, item.product_id);
                  });
                  updateStockStmt.finalize();
                }
              });
            }
          });
          res.json({ code: "00", message: "Success" });
        } else {
          res.json({ code: responseCode, message: "Fail" });
        }
    } else {
        res.json({ code: '97', message: 'Fail checksum' });
    }
});

function sortObject(obj) {
    let sorted = {};
    let str = [];
    let key;
    for (key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}



// ================= DISPOSALS API =================
app.get('/api/disposals', (req, res) => {
  db.all("SELECT * FROM disposals ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/disposals', (req, res) => {
  const { product_id, product_name, quantity, type, reason, cost, date, staff_name } = req.body;
  console.log(`[DISPOSAL] Nhận yêu cầu từ: ${staff_name}, Sản phẩm: ${product_name}`);
  
  db.run(`INSERT INTO disposals (product_id, product_name, quantity, type, reason, cost, date, staff_name) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [product_id, product_name, quantity, type, reason, cost || 0, date, staff_name],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // Nếu là loại 'Hủy', trừ tồn kho
      if (type === 'Hủy') {
        db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [quantity, product_id]);
      }
      
      res.json({ id: this.lastID, ...req.body });
    });
});

// ================= STATS API =================
app.get('/api/stats', (req, res) => {
  const stats = {
    totalRevenue: 0,
    grossRevenue: 0,
    totalInventoryCost: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalDisposalCost: 0,
    recentOrders: [],
    topProducts: []
  };

  // 1. Lấy doanh thu từ đơn hàng (không tính đơn đã hủy)
  db.get("SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue FROM orders WHERE status != 'Đã hủy'", [], (err, orderRow) => {
    if (err) return res.status(500).json({ error: err.message });
    
    stats.totalOrders = orderRow.count || 0;
    stats.grossRevenue = orderRow.revenue || 0;

    // 2. Lấy chi phí từ nhập hàng (chỉ tính phiếu đã hoàn thành)
    db.get("SELECT COALESCE(SUM(total), 0) as cost FROM inventory WHERE status = 'Hoàn thành'", [], (err, invRow) => {
      if (err) return res.status(500).json({ error: err.message });
      
      stats.totalInventoryCost = invRow.cost || 0;

      // 2.1 Lấy chi phí từ hủy hàng
      db.get("SELECT COALESCE(SUM(cost), 0) as cost FROM disposals WHERE type = 'Hủy'", [], (err, dispRow) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.totalDisposalCost = dispRow.cost || 0;
        stats.totalRevenue = stats.grossRevenue - stats.totalInventoryCost - stats.totalDisposalCost;

        // 3. Lấy số lượng khách hàng
      db.get("SELECT COUNT(DISTINCT customer_name) as count FROM orders WHERE status != 'Đã hủy'", [], (err, custRow) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.totalCustomers = custRow.count || 0;

        // 4. Thống kê sản phẩm bán chạy
        db.all(`
          SELECT oi.product_name, SUM(oi.quantity) as total_sold, oi.price 
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE o.status != 'Đã hủy'
          GROUP BY oi.product_id 
          ORDER BY total_sold DESC
          LIMIT 5
        `, [], (err, topProducts) => {
          if (err) return res.status(500).json({ error: err.message });
          stats.topProducts = topProducts;

          // 5. Đơn hàng gần đây
          db.all("SELECT * FROM orders WHERE status != 'Đã hủy' ORDER BY date DESC LIMIT 10", [], (err, recentOrders) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.recentOrders = recentOrders;
            
            res.json(stats);
          });
        });
      });
    });
  });
});
});

// Thêm dữ liệu mẫu (Seed) nếu chưa có
app.get('/api/seed', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM categories', [], (err, row) => {
    if (row && row.count === 0) {
      db.run("INSERT INTO categories (name, description) VALUES ('Rau củ', 'Các loại rau xanh, củ quả')");
      db.run("INSERT INTO categories (name, description) VALUES ('Trái cây', 'Trái cây tươi')");

      setTimeout(() => {
        db.run("INSERT INTO products (name, category_id, price, stock) VALUES ('Rau muống', 1, 15000, 50)");
        db.run("INSERT INTO products (name, category_id, price, stock) VALUES ('Táo Mỹ', 2, 85000, 30)");

        db.run("INSERT INTO users (name, email, password, role, status) VALUES ('Admin User', 'admin@allgreen.vn', '123456', 'Admin', 'Hoạt động')");
        db.run("INSERT INTO users (name, email, password, role, status) VALUES ('Nhân Viên 1', 'nhanvien@allgreen.vn', '123456', 'Nhân viên', 'Hoạt động')");
      }, 500);

      res.json({ message: 'Dữ liệu mẫu đã được tạo!' });
    } else {
      res.json({ message: 'Dữ liệu đã tồn tại.' });
    }
  });
});

// Middleware xử lý SPA routing cho Express 5
app.use((req, res, next) => {
  // Nếu không phải API và không phải tệp tin tĩnh (có dấu chấm)
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    return res.sendFile(path.join(__dirname, 'dist/index.html'));
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
