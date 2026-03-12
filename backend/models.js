const mongoose = require('mongoose');

// ─── USER MODEL ───────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  preferences: {
    preferredClass: { type: String, default: 'Economy' },
    frequentRoutes: [String],
    bookingCount: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

// ─── FLIGHT MODEL ─────────────────────────────────────────────────────────────
const flightSchema = new mongoose.Schema({
  flightId: { type: String, required: true, unique: true },
  airline: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  departure: { type: String, required: true },
  arrival: { type: String, required: true },
  basePrice: { type: Number, required: true },
  totalSeats: { type: Number, required: true },
  availableSeats: { type: Number, required: true },
  demandIndex: { type: Number, default: 0.5, min: 0, max: 1 },
  occupiedSeats: [{ type: Number }],
  status: { type: String, enum: ['On Time', 'Delayed', 'Boarding', 'Departed'], default: 'On Time' },
  updatedAt: { type: Date, default: Date.now }
});

// AI Dynamic Pricing Method
flightSchema.methods.calculateAIPrice = function(daysToDepart) {
  const demandMultiplier = 1 + (this.demandIndex * 0.65);
  let urgencyMultiplier = 1.0;
  if (daysToDepart <= 2) urgencyMultiplier = 1.55;
  else if (daysToDepart <= 5) urgencyMultiplier = 1.38;
  else if (daysToDepart <= 10) urgencyMultiplier = 1.22;
  else if (daysToDepart <= 20) urgencyMultiplier = 1.10;

  const occupancyRate = 1 - (this.availableSeats / this.totalSeats);
  const occupancyMultiplier = 1 + (occupancyRate * 0.3);

  return Math.round(this.basePrice * demandMultiplier * urgencyMultiplier * occupancyMultiplier);
};

// ─── BOOKING MODEL ─────────────────────────────────────────────────────────────
const bookingSchema = new mongoose.Schema({
  bookingRef: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  flightId: { type: String, required: true },
  flightDetails: {
    airline: String, from: String, to: String,
    departure: String, arrival: String, flightNo: String
  },
  travelDate: { type: Date, required: true },
  seatNumber: { type: String, required: true },
  seatIndex: { type: Number, required: true },
  price: { type: Number, required: true },
  basePrice: { type: Number },
  passengerName: { type: String },
  status: { type: String, enum: ['Confirmed', 'Cancelled', 'Checked-In'], default: 'Confirmed' },
  bookedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Flight = mongoose.model('Flight', flightSchema);
const Booking = mongoose.model('Booking', bookingSchema);

module.exports = { User, Flight, Booking };