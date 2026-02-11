import axios from 'axios';

// Creating an axios instance with your backend port 5001
const API = axios.create({
    baseURL: 'http://localhost:5001/api/v1/user',
});

export const loginUser = (data) => API.post('/login', data);
export const sendOtp = (data) => API.post('/send-otp', data);
export const resetPassword = (data) => API.post('/reset-password', data);

export default API;