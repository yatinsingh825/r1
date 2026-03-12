require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Flight, Booking } = require('./models');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// ─── SSE CLIENT REGISTRY ──────────────────────────────────────────────────────
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
    console.log('✅ MongoDB connected to', process.env.MONGODB_URI);
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

// ─── SSE STREAM ENDPOINT ─────────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  sseClients.add(res);
  console.log(`📡 SSE client connected (total: ${sseClients.size})`);

  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch {}
  }, 20000);

  req.on('close', () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
    console.log(`📡 SSE client disconnected (total: ${sseClients.size})`);
  });
});

// ─── REAL-TIME ENGINE ─────────────────────────────────────────────────────────
async function startRealTimeEngine() {
  console.log('🔴 Real-time engine started');

  // Price tick every 4 seconds — fluctuate demand, recalculate AI prices
  setInterval(async () => {
    try {
      const flights = await Flight.find({});
      const updates = [];
      for (const flight of flights) {
        const drift = (Math.random() - 0.48) * 0.025;
        flight.demandIndex = parseFloat(Math.max(0.1, Math.min(1, flight.demandIndex + drift)).toFixed(3));
        flight.updatedAt = new Date();
        await flight.save();
        updates.push({
          flightId: flight.flightId,
          demandIndex: flight.demandIndex,
          aiPrice: flight.calculateAIPrice(14),
          availableSeats: flight.availableSeats,
        });
      }
      broadcast('price_update', { updates, ts: Date.now() });
    } catch (err) {
      console.error('Price tick error:', err.message);
    }
  }, 4000);

  // Simulate a random seat getting booked every 12 seconds
  setInterval(async () => {
    try {
      const eligible = await Flight.find({ availableSeats: { $gt: 5 } });
      if (!eligible.length) return;
      const flight = eligible[Math.floor(Math.random() * eligible.length)];
      const allSeats = Array.from({ length: flight.totalSeats }, (_, i) => i);
      const free = allSeats.filter(i => !flight.occupiedSeats.includes(i));
      if (!free.length) return;
      const seatIdx = free[Math.floor(Math.random() * free.length)];
      flight.occupiedSeats.push(seatIdx);
      flight.availableSeats -= 1;
      flight.demandIndex = parseFloat(Math.min(1, flight.demandIndex + 0.005).toFixed(3));
      flight.updatedAt = new Date();
      await flight.save();
      broadcast('seat_booked', {
        flightId: flight.flightId,
        seatIdx,
        availableSeats: flight.availableSeats,
        occupiedSeats: flight.occupiedSeats,
        aiPrice: flight.calculateAIPrice(14),
        demandIndex: flight.demandIndex,
        simulated: true,
        ts: Date.now(),
      });
      console.log(`🎟  Sim booking: ${flight.flightId} seat #${seatIdx} (${flight.availableSeats} left)`);
    } catch (err) {
      console.error('Seat sim error:', err.message);
    }
  }, 12000);

  // Stats counter every 8 seconds
  setInterval(async () => {
    try {
      const count = await Booking.countDocuments({ status: 'Confirmed' });
      const agg = await Booking.aggregate([
        { $match: { status: 'Confirmed' } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ]);
      broadcast('stats_update', {
        totalBookings: count,
        totalRevenue: agg[0]?.total || 0,
        ts: Date.now(),
      });
    } catch {}
  }, 8000);
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password min 4 characters' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── FLIGHT ROUTES ────────────────────────────────────────────────────────────
app.get('/api/flights', async (req, res) => {
  try {
    const { from, to, days = 14 } = req.query;
    const filter = {};
    if (from) filter.from = from;
    if (to) filter.to = to;
    const flights = await Flight.find(filter);
    const daysLeft = parseInt(days);
    res.json(flights.map(f => ({
      _id: f._id, flightId: f.flightId, airline: f.airline,
      from: f.from, to: f.to, departure: f.departure, arrival: f.arrival,
      basePrice: f.basePrice, aiPrice: f.calculateAIPrice(daysLeft),
      totalSeats: f.totalSeats, availableSeats: f.availableSeats,
      occupiedSeats: f.occupiedSeats, demandIndex: f.demandIndex,
      status: f.status, updatedAt: f.updatedAt,
      occupancyRate: Math.round(((f.totalSeats - f.availableSeats) / f.totalSeats) * 100),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/flights/:flightId', async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightId: req.params.flightId });
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    const days = parseInt(req.query.days) || 14;
    res.json({ ...flight.toObject(), aiPrice: flight.calculateAIPrice(days), occupancyRate: Math.round(((flight.totalSeats - flight.availableSeats) / flight.totalSeats) * 100) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/flights/:flightId/pricing', async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightId: req.params.flightId });
    if (!flight) return res.status(404).json({ error: 'Not found' });
    const history = [];
    for (let d = 60; d >= 1; d -= 3) history.push({ daysLeft: d, label: `D-${d}`, price: flight.calculateAIPrice(d) });
    history.push({ daysLeft: 1, label: 'D-1', price: flight.calculateAIPrice(1) });
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BOOKING ROUTES ───────────────────────────────────────────────────────────
app.post('/api/bookings', auth, async (req, res) => {
  try {
    const { flightId, seatNumber, seatIndex, travelDate, days, passengerName } = req.body;
    const flight = await Flight.findOne({ flightId });
    if (!flight) return res.status(404).json({ error: 'Flight not found' });
    if (flight.availableSeats <= 0) return res.status(400).json({ error: 'No seats available' });
    if (flight.occupiedSeats.includes(seatIndex)) return res.status(400).json({ error: 'Seat already taken — please choose another' });

    const price = flight.calculateAIPrice(parseInt(days) || 14);
    const ref = 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 3).toUpperCase();

    flight.occupiedSeats.push(seatIndex);
    flight.availableSeats -= 1;
    flight.demandIndex = parseFloat(Math.min(1, flight.demandIndex + 0.012).toFixed(3));
    flight.updatedAt = new Date();
    await flight.save();

    await User.findByIdAndUpdate(req.user.id, { $inc: { 'preferences.bookingCount': 1 } });

    const booking = await Booking.create({
      bookingRef: ref, userId: req.user.id, flightId,
      flightDetails: { airline: flight.airline, from: flight.from, to: flight.to, departure: flight.departure, arrival: flight.arrival, flightNo: flight.flightId },
      travelDate: new Date(travelDate), seatNumber, seatIndex, price,
      basePrice: flight.basePrice, passengerName: passengerName || req.user.name, status: 'Confirmed'
    });

    // Broadcast real booking to all SSE clients
    broadcast('seat_booked', {
      flightId, seatIdx: seatIndex,
      availableSeats: flight.availableSeats,
      occupiedSeats: flight.occupiedSeats,
      aiPrice: flight.calculateAIPrice(parseInt(days) || 14),
      demandIndex: flight.demandIndex,
      realBooking: true, ts: Date.now(),
    });

    res.json({ booking, flight: { ...flight.toObject(), aiPrice: price } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bookings/my', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id }).sort({ bookedAt: -1 });
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments({ status: 'Confirmed' });
    const revenueAgg = await Booking.aggregate([{ $match: { status: 'Confirmed' } }, { $group: { _id: null, total: { $sum: '$price' } } }]);
    const avgPriceAgg = await Booking.aggregate([{ $match: { status: 'Confirmed' } }, { $group: { _id: null, avg: { $avg: '$price' } } }]);
    const flights = await Flight.find({});
    const totalSeats = flights.reduce((a, f) => a + f.totalSeats, 0);
    const occupiedSeats = flights.reduce((a, f) => a + (f.totalSeats - f.availableSeats), 0);
    res.json({
      totalBookings, flightCount: flights.length,
      totalRevenue: revenueAgg[0]?.total || 0,
      avgPrice: Math.round(avgPriceAgg[0]?.avg || 0),
      avgOccupancy: Math.round((occupiedSeats / totalSeats) * 100),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/flights', async (req, res) => {
  try {
    const flights = await Flight.find({}).sort({ demandIndex: -1 });
    res.json(flights.map(f => ({ ...f.toObject(), aiPrice: f.calculateAIPrice(14), occupancyRate: Math.round(((f.totalSeats - f.availableSeats) / f.totalSeats) * 100) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ bookedAt: -1 }).limit(30).populate('userId', 'name email');
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', sseClients: sseClients.size, timestamp: new Date() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 SkyAI Backend  →  http://localhost:${PORT}`);
  console.log(`📡 SSE Stream     →  http://localhost:${PORT}/api/stream`);
  console.log(`✈  Flights        →  http://localhost:${PORT}/api/flights\n`);
});