const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const db = new sqlite3.Database('./database.sqlite');

const tables = ['users', 'categories', 'products'];
const data = {};

let count = 0;
tables.forEach(table => {
  db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
    if (err) {
      console.error(`Error reading ${table}:`, err);
    } else {
      data[table] = rows;
    }
    count++;
    if (count === tables.length) {
      fs.writeFileSync('dump_data.json', JSON.stringify(data, null, 2));
      console.log('Data dumped to dump_data.json');
      db.close();
    }
  });
});
