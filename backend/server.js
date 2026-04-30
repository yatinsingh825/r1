require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const { User, Flight, Booking } = require('./models');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// ─── AI SERVICE ───────────────────────────────────────────────────────────────
async function getAIPrice(flight, days) {
  try {
    const res = await axios.post("http://localhost:8000/predict", {
      airline: flight.airline,
      source_city: flight.from,
      destination_city: flight.to,
      departure_time: "Morning",
      stops: "zero",
      class: "Economy",
      duration: 2.5,
      days_left: days
    });

    return Number(res.data.predicted_price) || flight.basePrice;

  } catch (err) {
    console.error("❌ AI Error:", err.message);
    return Number(flight.basePrice) || 3000;
  }
}

function applyRealWorldPricing(basePrice, flight, daysLeft) {
  let price = Number(basePrice) || 3000;

  if (flight.demandIndex > 0.8) price *= 1.5;
  else if (flight.demandIndex > 0.6) price *= 1.3;
  else if (flight.demandIndex > 0.4) price *= 1.15;

  if (flight.availableSeats < 5) price *= 1.6;
  else if (flight.availableSeats < 10) price *= 1.3;

  if (daysLeft < 3) price *= 1.8;
  else if (daysLeft < 7) price *= 1.4;
  else if (daysLeft < 15) price *= 1.2;

  price += Math.random() * 400;

  return Math.max(Math.round(price), 2000);
}

// ─── SSE CLIENTS ──────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch {}
  });
}

// ─── DB CONNECTION ────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    startRealTimeEngine();
  })
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// ─── SSE STREAM ───────────────────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ─── REAL-TIME ENGINE ─────────────────────────────────────────────────────────
async function startRealTimeEngine() {
  console.log('🔴 Real-time engine started');

  setInterval(async () => {
    try {
      const flights = await Flight.find({});
      const updates = [];

      for (const flight of flights) {
        let basePrice = await getAIPrice(flight, 14);
let price = applyRealWorldPricing(basePrice, flight, 14);

        updates.push({
          flightId: flight.flightId,
          aiPrice: price,
          availableSeats: flight.availableSeats,
          demandIndex: flight.demandIndex
        });
      }

      broadcast('price_update', { updates, ts: Date.now() });

    } catch (err) {
      console.error("Realtime error:", err.message);
    }
  }, 5000);
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({ token, user });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 🔥 FIXED PRICING ROUTE ───────────────────────────────────────────────────
app.get('/api/flights/:flightId/pricing', async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightId: req.params.flightId });

    if (!flight) {
      return res.status(404).json({ error: 'Flight not found' });
    }

    const history = [];

    for (let d = 60; d >= 5; d -= 5) {
  let basePrice = await getAIPrice(flight, d);
  let finalPrice = applyRealWorldPricing(basePrice, flight, d);

  history.push({
    daysLeft: d,
    label: `D-${d}`,
    price: finalPrice
  });
}

    res.json(history);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FLIGHTS ──────────────────────────────────────────────────────────────────
app.get('/api/flights', async (req, res) => {
  try {
    const { from, to, days = 14 } = req.query;

    const filter = {};
    if (from) filter.from = from;
    if (to) filter.to = to;

    const flights = await Flight.find(filter);

    const result = [];

    for (const f of flights) {
      let basePrice = await getAIPrice(f, parseInt(days));
      let aiPrice = applyRealWorldPricing(basePrice, f, parseInt(days));

      result.push({
        ...f.toObject(),
        aiPrice,
        occupancyRate: Math.round(((f.totalSeats - f.availableSeats) / f.totalSeats) * 100)
      });
    }

    res.json(result);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/flights/:flightId', async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightId: req.params.flightId });

    if (!flight) return res.status(404).json({ error: 'Flight not found' });

    let basePrice = await getAIPrice(flight, 14);
let price = applyRealWorldPricing(basePrice, flight, 14);

    res.json({
      ...flight.toObject(),
      aiPrice: price
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
app.post('/api/bookings', auth, async (req, res) => {
  try {
    const { flightId, seatNumber, seatIndex, travelDate, passengerName } = req.body;

    const flight = await Flight.findOne({ flightId });

    if (!flight) return res.status(404).json({ error: 'Flight not found' });

    let basePrice = await getAIPrice(flight, 14);
let price = applyRealWorldPricing(basePrice, flight, 14);
    const booking = await Booking.create({
      bookingRef: "BK" + Date.now(),
      userId: req.user.id,
      flightId,
      seatNumber,
      seatIndex,
      travelDate,
      passengerName,
      price,
      status: 'Confirmed'
    });

    res.json({ booking });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/my', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    res.json({ totalBookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running → http://localhost:${PORT}`);
});