import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import adminRoutes from './feature/admin/admin.routes.js';
import bookingRoutes from './feature/booking/booking.routes.js';

// Load environment variables from .env file
// This allows you to use process.env.VARIABLE_NAME throughout your app
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes (allows cross-origin requests)
app.use(cors());
// Parse incoming JSON requests
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Express server is running!');
});

// Mount admin-related routes under /admin
app.use('/admin', adminRoutes);
// Mount booking-related routes under /booking
app.use('/booking', bookingRoutes);

// Start the server and listen on the specified port
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
