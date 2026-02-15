import express from 'express';
import cors from 'cors';
import userRouter from './routes/userRoutes.js';
import examRoutes from './routes/examRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes setup
app.use('/api/v1/user', userRouter);
app.use('/api/exams', examRoutes);

const PORT = 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));