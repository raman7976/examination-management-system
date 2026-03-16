import axios from 'axios';

// Change the baseURL to the root API level
const API = axios.create({
    baseURL: 'http://localhost:5001/api', 
});

// User Routes (prefixed with /v1/user)
export const loginUser = (data) => API.post('/v1/user/login', data);
export const sendOtp = (data) => API.post('/v1/user/send-otp', data);
export const resetPassword = (data) => API.post('/v1/user/reset-password', data);

// Exam Routes (prefixed with /exams)
export const addSlot = (data) => API.post('/exams/add-slot', data);
export const getSlots = () => API.get('/exams/available-slots');
export const schedule = (data) => API.post('/exams/schedule', data);

export default API;