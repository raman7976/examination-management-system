import express from 'express';
import cors from 'cors';
import userRouter from './routes/userRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes setup
app.use('/api/v1/user', userRouter);

const PORT = 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));