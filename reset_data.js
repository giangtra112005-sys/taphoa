const db = require('./database');

db.serialize(() => {
  console.log('Bắt đầu reset dữ liệu...');

  db.run('DELETE FROM order_items', (err) => {
    if (err) console.error('Lỗi khi xóa order_items:', err.message);
    else console.log('Đã xóa dữ liệu chi tiết đơn hàng.');
  });

  db.run('DELETE FROM orders', (err) => {
    if (err) console.error('Lỗi khi xóa orders:', err.message);
    else console.log('Đã xóa dữ liệu đơn hàng.');
  });

  db.run('DELETE FROM inventory_items', (err) => {
    if (err) console.error('Lỗi khi xóa inventory_items:', err.message);
    else console.log('Đã xóa dữ liệu chi tiết nhập hàng.');
  });

  db.run('DELETE FROM inventory', (err) => {
    if (err) console.error('Lỗi khi xóa inventory:', err.message);
    else console.log('Đã xóa dữ liệu phiếu nhập hàng.');
  });

  // Tùy chọn: Reset tồn kho sản phẩm về 0
  db.run('UPDATE products SET stock = 0', (err) => {
    if (err) console.error('Lỗi khi reset tồn kho:', err.message);
    else console.log('Đã reset tồn kho sản phẩm về 0.');
  });

  console.log('Reset dữ liệu thành công!');
});

// Đóng kết nối sau khi xong
setTimeout(() => {
    db.close();
}, 2000);
