const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.all('SELECT * FROM orders', [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Orders in database:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
