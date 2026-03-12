require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Flight, Booking } = require('./models');

const FLIGHTS_DATA = [
  { flightId: 'AI201', airline: 'Air India', from: 'Delhi', to: 'Mumbai', departure: '06:00', arrival: '08:10', basePrice: 3200, totalSeats: 48, availableSeats: 12, demandIndex: 0.87, status: 'On Time' },
  { flightId: '6E301', airline: 'IndiGo', from: 'Delhi', to: 'Mumbai', departure: '09:30', arrival: '11:45', basePrice: 2800, totalSeats: 60, availableSeats: 31, demandIndex: 0.62, status: 'On Time' },
  { flightId: 'SG501', airline: 'SpiceJet', from: 'Delhi', to: 'Mumbai', departure: '13:15', arrival: '15:25', basePrice: 2500, totalSeats: 54, availableSeats: 28, demandIndex: 0.43, status: 'Delayed' },
  { flightId: 'UK402', airline: 'Vistara', from: 'Delhi', to: 'Mumbai', departure: '17:50', arrival: '20:00', basePrice: 3600, totalSeats: 45, availableSeats: 8, demandIndex: 0.91, status: 'On Time' },
  { flightId: 'AI305', airline: 'Air India', from: 'Delhi', to: 'Bangalore', departure: '07:00', arrival: '09:40', basePrice: 4100, totalSeats: 48, availableSeats: 9, demandIndex: 0.79, status: 'On Time' },
  { flightId: '6E410', airline: 'IndiGo', from: 'Delhi', to: 'Bangalore', departure: '11:00', arrival: '13:35', basePrice: 3600, totalSeats: 66, availableSeats: 22, demandIndex: 0.55, status: 'On Time' },
  { flightId: 'UK720', airline: 'Vistara', from: 'Mumbai', to: 'Chennai', departure: '08:15', arrival: '10:00', basePrice: 3900, totalSeats: 45, availableSeats: 5, demandIndex: 0.91, status: 'Boarding' },
  { flightId: 'SG610', airline: 'SpiceJet', from: 'Mumbai', to: 'Chennai', departure: '14:30', arrival: '16:15', basePrice: 2900, totalSeats: 54, availableSeats: 19, demandIndex: 0.67, status: 'On Time' },
  { flightId: 'AI810', airline: 'Air India', from: 'Delhi', to: 'Hyderabad', departure: '08:30', arrival: '11:00', basePrice: 3800, totalSeats: 48, availableSeats: 14, demandIndex: 0.73, status: 'On Time' },
  { flightId: '6E925', airline: 'IndiGo', from: 'Mumbai', to: 'Kolkata', departure: '10:00', arrival: '12:50', basePrice: 4400, totalSeats: 60, availableSeats: 17, demandIndex: 0.69, status: 'On Time' },
  { flightId: 'AI560', airline: 'Air India', from: 'Bangalore', to: 'Delhi', departure: '19:00', arrival: '21:40', basePrice: 4200, totalSeats: 48, availableSeats: 6, demandIndex: 0.88, status: 'On Time' },
  { flightId: 'UK310', airline: 'Vistara', from: 'Chennai', to: 'Mumbai', departure: '06:45', arrival: '08:30', basePrice: 3500, totalSeats: 45, availableSeats: 21, demandIndex: 0.58, status: 'On Time' },
];

// Generate occupied seat indices for each flight
FLIGHTS_DATA.forEach(f => {
  const occupied = f.totalSeats - f.availableSeats;
  const seats = new Set();
  while (seats.size < occupied) seats.add(Math.floor(Math.random() * f.totalSeats));
  f.occupiedSeats = Array.from(seats);
});

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing
    await Flight.deleteMany({});
    await User.deleteMany({});
    await Booking.deleteMany({});
    console.log('🗑️  Cleared existing data');

    // Insert flights
    await Flight.insertMany(FLIGHTS_DATA);
    console.log(`✈️  Inserted ${FLIGHTS_DATA.length} flights`);

    // Create demo user
    const hashedPass = await bcrypt.hash('demo1234', 10);
    await User.create({
      name: 'Demo User',
      email: 'demo@skyai.com',
      password: hashedPass,
      preferences: { preferredClass: 'Economy', frequentRoutes: ['Delhi-Mumbai', 'Delhi-Bangalore'], bookingCount: 5 }
    });
    console.log('👤 Created demo user: demo@skyai.com / demo1234');

    console.log('\n🚀 Database seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seed();