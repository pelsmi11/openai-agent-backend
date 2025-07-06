import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import adminRoutes from './feature/admin/admin.routes.js';
import bookingRoutes from './feature/booking/booking.routes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Express server is running!');
});

// Aquí puedes agregar tus rutas
app.use('/admin', adminRoutes);
app.use('/booking', bookingRoutes);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
