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
import dotenv from 'dotenv';

dotenv.config();

const app = express();


// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================
app.use(helmet());             // Protects against common web vulnerabilities
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));               // Allows your frontend to talk to this backend
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
const PORT = process.env.PORT ;




app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT} ..... `);
});