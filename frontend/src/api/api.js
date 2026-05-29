import axios from 'axios';

// Relative URL → goes through the Vite proxy (see vite.config.js)
const API = axios.create({
    baseURL: '/api',
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


// Upload / Data Ingestion Routes
export const uploadCourses = (formData) =>
    API.post('/upload/courses', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadEnrollments = (formData) =>
    API.post('/upload/enrollments', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
// Pass {wipeRoster: true} to ALSO drop courses/enrollments/instructors for
// the active semester (default leaves the roster untouched).
export const resetSemesterData = ({ wipeRoster = false } = {}) =>
    API.delete(`/upload/reset${wipeRoster ? '?wipe_roster=true' : ''}`);
export const getCourseList = (search = '') => API.get(`/upload/courses?search=${encodeURIComponent(search)}`);
export const getEnrollmentList = (search = '') => API.get(`/upload/enrollments?search=${encodeURIComponent(search)}`);
export const getEnrollmentMismatches = () => API.get('/upload/enrollment-mismatches');

// Schedule Routes
export const getExamSlots = () => API.get('/schedule/slots');
export const getUnscheduledCourses = () => API.get('/schedule/unscheduled-courses');
export const getScheduledCourses = () => API.get('/schedule/scheduled-courses');
export const assignCoursesToSlot = (data) => API.post('/schedule/assign', data);
export const unassignCourse = (id) => API.delete(`/schedule/unassign/${id}`);

// Seating Routes
export const generateMicroPlan = (data) => API.post('/seating/generate-plan', data);
export const getPlanView = (slotId, classroomId) => {
    let url = `/seating/view-plan?slot_id=${slotId}`;
    if (classroomId) url += `&classroom_id=${classroomId}`;
    return API.get(url);
};
export const getSeatingArrangementStatus = () => API.get('/seating/status');

// Exam Session Routes
export const saveExamSession = (data) => API.post('/seating/sessions/save', data);
export const getExamSessions = () => API.get('/seating/sessions');
export const getExamSessionById = (id) => API.get(`/seating/sessions/${id}`);
export const deleteExamSession = (id) => API.delete(`/seating/sessions/${id}`);

// Registration Routes
export const registerInvigilator         = (data)     => API.post('/registration/register', data);
export const bulkRegisterInvigilators    = (formData) => API.post('/registration/bulk-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getInvigilators             = (search = '') => API.get(`/registration/invigilators?search=${encodeURIComponent(search)}`);
export const deleteInvigilator           = (id)        => API.delete(`/registration/invigilators/${id}`);
export const downloadInvigilatorTemplate = ()          => API.get('/registration/template', { responseType: 'blob' });

// Course-Instructor Mapping Routes
export const uploadCourseInstructors          = (formData) => API.post('/upload/course-instructors', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const downloadCourseInstructorTemplate = ()         => API.get('/upload/course-instructor-template', { responseType: 'blob' });

// Invigilator Scheduling Routes — exam periods
export const getExamPeriods       = ()             => API.get('/invigilator-scheduling/exam-periods');
export const getPeriodsOverview   = ()             => API.get('/invigilator-scheduling/periods-overview');
export const createSemester       = (body)         => API.post('/invigilator-scheduling/semesters', body);
export const activateExamPeriod   = (id)           => API.put(`/invigilator-scheduling/exam-periods/${id}/activate`);
export const deleteExamPeriod     = (id)           => API.delete(`/invigilator-scheduling/exam-periods/${id}`);

// Invigilator Scheduling Routes
export const getRoleTargets               = ()                    => API.get('/invigilator-scheduling/role-targets');
export const updateRoleTargets            = (targets)             => API.put('/invigilator-scheduling/role-targets', { targets });
export const getInvigilatorScheduleList   = (search = '')         => API.get(`/invigilator-scheduling/invigilators?search=${encodeURIComponent(search)}`);
export const updateInvigilatorOverride    = (userId, body)        => API.put(`/invigilator-scheduling/invigilators/${userId}/override`, body);
export const generateInvigilatorSchedule  = (body = {})           => API.post('/invigilator-scheduling/generate', body);
export const previewInvigilatorSchedule   = (body = {})           => API.post('/invigilator-scheduling/generate-preview', body);
export const getInvigilatorSchedule       = (slotId = '')         => API.get(`/invigilator-scheduling/schedule${slotId ? `?slot_id=${slotId}` : ''}`);
export const getEligibleInvigilators      = (slotId, excludeId)   => API.get(`/invigilator-scheduling/eligible?slot_id=${slotId}${excludeId ? `&exclude_assignment_id=${excludeId}` : ''}`);
export const addInvigilatorAssignment     = (body)                => API.post('/invigilator-scheduling/assignments', body);
export const reassignInvigilatorAssignment = (id, userId)         => API.put(`/invigilator-scheduling/assignments/${id}/reassign`, { user_id: userId });
export const removeInvigilatorAssignment  = (id)                  => API.delete(`/invigilator-scheduling/assignments/${id}`);
export const applyInvigilatorChanges      = (body)                => API.post('/invigilator-scheduling/apply-changes', body);
export const clearInvigilatorSchedule     = (periodId)            => API.delete(`/invigilator-scheduling/schedule${periodId ? `?period_id=${periodId}` : ''}`);

// User-self (used by the Profile tab — JWT only carries id/email/role, this
// fills in employee_id + department + created_at).
export const getMyProfile               = ()                 => API.get('/v1/user/me');

// Invigilator self-service (faculty / phd_student / lab_staff only)
export const getMyInvigilationSchedule  = ()                 => API.get('/invigilator-scheduling/my-schedule');
export const getSwapEligibleTargets     = (id)               => API.get(`/invigilator-scheduling/swap-eligible?my_assignment_id=${id}`);
export const createSwapRequest          = (body)             => API.post('/invigilator-scheduling/swap-requests', body);
export const getIncomingSwapRequests    = ()                 => API.get('/invigilator-scheduling/swap-requests/incoming');
export const getOutgoingSwapRequests    = (status = '')      => API.get(`/invigilator-scheduling/swap-requests/outgoing${status ? `?status=${status}` : ''}`);
export const peerRespondToSwap          = (id, body)         => API.put(`/invigilator-scheduling/swap-requests/${id}/peer-respond`, body);
export const cancelMySwapRequest        = (id)               => API.delete(`/invigilator-scheduling/swap-requests/${id}`);

// Admin swap moderation
export const adminListSwapRequests      = (status = 'all')   => API.get(`/invigilator-scheduling/swap-requests?status=${status}`);
export const adminRespondToSwap         = (id, body)         => API.put(`/invigilator-scheduling/swap-requests/${id}/admin-respond`, body);

export default API;