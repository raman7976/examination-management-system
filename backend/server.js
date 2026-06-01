import express from 'express';
import cors from 'cors';
import helmet from 'helmet'; // Adds essential security headers
import morgan from 'morgan'; // Logs HTTP requests for easier debugging
import userRouter from './routes/userRoutes.js';
import examRoutes from './routes/examRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import seatingRoutes from './routes/seatingRoutes.js';
import registrationRoutes from './routes/registrationRoutes.js';
import invigilatorSchedulingRoutes from './routes/invigilatorSchedulingRoutes.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Trust the first proxy hop (needed so express-rate-limit reads the real client
// IP from X-Forwarded-For instead of the proxy's). Safe for a single reverse
// proxy / load balancer in front of the app.
app.set('trust proxy', 1);

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================

// Allow-list of front-end origins. Configure CORS_ORIGINS in .env as a
// comma-separated list (e.g. "https://exams.lnmiit.ac.in,https://admin.lnmiit.ac.in").
// Falls back to the local Vite dev servers when unset.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(helmet());             // Protects against common web vulnerabilities
app.use(cors({
    origin: (origin, cb) => {
        // Allow same-origin / non-browser tools (no Origin header) and any
        // explicitly allow-listed origin; reject everything else.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    exposedHeaders: ['Content-Disposition'],
}));
app.use(morgan('dev'));        // Logs requests
app.use(express.json());       // Parses incoming JSON payloads






// ==========================================
// 2. ROUTES SETUP
// ==========================================
app.use('/api/v1/user', userRouter);
app.use('/api/exams', examRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/seating', seatingRoutes);
app.use('/api/registration', registrationRoutes);
app.use('/api/invigilator-scheduling', invigilatorSchedulingRoutes);






// ==========================================
// 3. SAFETY NETS (ERROR HANDLING)
// ==========================================

// Catch-all for 404 Not Found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found on this server.`
  });
});


// Global Error Handler
// If any route calls next(error), it drops down to this function
app.use((err, req, res, next) => {
  console.error(" Error: ", err.message);
  
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // Only reveal the exact code breakdown in development mode, hide in production
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});




// ==========================================
// 4. SERVER INITIALIZATION
// ==========================================
// Use the environment port, OR fallback to 5001 locally
const PORT = process.env.PORT || 5001;

// Skip listening under test — the integration suite imports `app` directly into
// supertest (in-process HTTP) and must not bind a real port.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT} ..... `);
  });
}

// Exported so tests (supertest) can drive the app without a live socket.
export default app;