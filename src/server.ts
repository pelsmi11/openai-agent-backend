import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import adminRoutes from './feature/admin/admin.routes.js';
import bookingRoutes from './feature/booking/booking.routes.js';
import { setupAgentGraph } from './feature/booking/agent-graph.js';
import { requireAuth } from './lib/auth/zitadel-auth.middleware.js';

// Load environment variables from .env file
// This allows you to use process.env.VARIABLE_NAME throughout your app
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes (allows cross-origin requests)
app.use(cors());
// Parse incoming JSON requests
app.use(express.json({ limit: '16kb' }));

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('Express server is running!');
});

// Health check for frontends/uptime monitors (e.g. Render) to poll
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Mount admin-related routes under /admin (requires a valid ZITADEL bearer token)
app.use('/admin', requireAuth, adminRoutes);
// Mount booking-related routes under /booking (public — this is what end users hit to talk to the agent)
app.use('/booking', bookingRoutes);

const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The request body must contain valid JSON.' },
    });
    return;
  }
  next(error);
};
app.use(jsonErrorHandler);

// Create LangGraph's checkpoint tables (idempotent) before accepting requests.
await setupAgentGraph();

// Start the server and listen on the specified port
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
