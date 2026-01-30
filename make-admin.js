const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const email = process.argv[2];

if (!email) {
    console.error('Te rog specifică un email: node make-admin.js user@email.com');
    process.exit(1);
}

db.run(`UPDATE users SET isAdmin = 1 WHERE email = ?`, [email], function (err) {
    if (err) {
        console.error('Eroare:', err.message);
    } else if (this.changes === 0) {
        console.log('Userul nu a fost găsit.');
    } else {
        console.log(`Succes! Userul ${email} este acum Admin.`);
    }
    db.close();
});
