import axios from 'axios';

// Change the baseURL to the root API level
const API = axios.create({
    baseURL: 'http://localhost:5002/api', // <-- Changed to 5002
});

// ==========================================
// THE INTERCEPTOR (The VIP Wristband)
// This runs automatically before EVERY request
// ==========================================
API.interceptors.request.use((req) => {
    // Look in the browser's local storage for the saved token
    const token = localStorage.getItem('token');
    
    // If a token exists, attach it to the headers exactly how the backend expects it
    if (token) {
        req.headers.authorization = `Bearer ${token}`;
    }
    
    return req;
});
API.interceptors.response.use(
    (response) => {
        // If the backend replies with a 200 OK, just pass the data through normally
        return response;
    },
    (error) => {
        // If the backend replies with a 401 Unauthorized (Token expired or invalid)
        if (error.response && error.response.status === 401) {
            console.error("Session expired. Logging out...");
            
            // Destroy the dead token and user data
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // Force the browser back to the login screen
            window.location.href = '/'; 
        }
        return Promise.reject(error);
    }
);

// ==========================================
// API EXPORTS
// ==========================================

// User Routes (prefixed with /v1/user)
export const loginUser = (data) => API.post('/v1/user/login', data);
export const sendOtp = (data) => API.post('/v1/user/send-otp', data);
export const resetPassword = (data) => API.post('/v1/user/reset-password', data);

// Exam Routes (Updated to use our new Batch controllers!)
export const addBatchSlots = (data) => API.post('/exams/add-batch-slots', data);
export const getSlots = () => API.get('/exams/available-slots');
export const scheduleBatch = (data) => API.post('/exams/schedule-batch', data);

export default API;