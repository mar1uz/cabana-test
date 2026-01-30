require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML, CSS, and Images from root

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware to check if Admin
const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ message: "Admin access required" });
    }
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ message: "User already exists" });
                }
                return res.status(500).json({ message: err.message });
            }
            res.status(201).json({ message: "User created", userId: this.lastID });
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ message: "User not found" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: "Invalid password" });

        const token = jwt.sign({ id: user.id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { email: user.email, isAdmin: user.isAdmin } });
    });
});

// --- BOOKING & PAYMENT ROUTES ---

// Test mode reservation (no payment required)
app.post('/api/reservations/test', authenticateToken, (req, res) => {
    const { checkIn, checkOut, guests, totalPrice } = req.body;

    db.run(`INSERT INTO reservations (userId, checkIn, checkOut, guests, totalPrice, paymentIntentId, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, checkIn, checkOut, guests, totalPrice, 'TEST-MODE', 'pending'],
        function (err) {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ message: 'Reservation created successfully', reservationId: this.lastID });
        }
    );
});

// Check availability for date range
app.post('/api/check-availability', (req, res) => {
    const { checkIn, checkOut } = req.body;

    // Get all confirmed reservations that overlap with requested dates
    db.all(`SELECT * FROM reservations WHERE status = 'confirmed' AND 
            ((checkIn <= ? AND checkOut > ?) OR 
             (checkIn < ? AND checkOut >= ?) OR 
             (checkIn >= ? AND checkOut <= ?))`,
        [checkIn, checkIn, checkOut, checkOut, checkIn, checkOut],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ available: rows.length === 0, conflicts: rows });
        }
    );
});

// Get all booked dates (confirmed reservations only)
app.get('/api/booked-dates', (req, res) => {
    db.all(`SELECT checkIn, checkOut FROM reservations WHERE status = 'confirmed'`, (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

app.post('/api/create-checkout-session', authenticateToken, async (req, res) => {
    const { checkIn, checkOut, guests, totalPrice } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `Rezervare Cabana Ieremia - ${checkIn} la ${checkOut}`,
                    },
                    unit_amount: totalPrice * 100, // Stripe expects cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `http://localhost:${PORT}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `http://localhost:${PORT}/cancel.html`,
        });

        // Save pending reservation
        db.run(`INSERT INTO reservations (userId, checkIn, checkOut, guests, totalPrice, paymentIntentId, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, checkIn, checkOut, guests, totalPrice, session.id, 'pending']);

        res.json({ id: session.id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- ADMIN ROUTES ---

app.get('/api/admin/reservations', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT reservations.*, users.email FROM reservations JOIN users ON reservations.userId = users.id ORDER BY id DESC`, (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// Confirm or cancel a reservation
app.patch('/api/admin/reservations/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'confirmed' or 'cancelled'

    if (!['confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    db.run(`UPDATE reservations SET status = ? WHERE id = ?`, [status, id], function (err) {
        if (err) return res.status(500).json({ message: err.message });
        if (this.changes === 0) return res.status(404).json({ message: 'Reservation not found' });
        res.json({ message: `Reservation ${status}`, reservationId: id });
    });
});

// Serve Frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
