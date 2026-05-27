import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddExam from './pages/AddExam.jsx';
import AddCourse from './pages/AddCourse.jsx';
import SmartScheduling from './pages/SmartScheduling.jsx';
import SeatingManager from './pages/SeatingManager.jsx';
import SeatingArrangement from './pages/SeatingArrangement.jsx';
import CourseSeatingPDF from './pages/CourseSeatingPDF.jsx';
import PastExams from './pages/PastExams.jsx';
import Registration from './pages/Registration.jsx';
import InvigilatorPortal from './pages/InvigilatorPortal.jsx';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/forgotPassword" element={<ForgotPassword />} />

        {/* ADMIN-ONLY: full dashboard (requires JWT + role=admin) */}
        <Route element={<AdminRoute />}>
          <Route path="/dashboard" element={<Dashboard />}>
            <Route path="registration"        element={<Registration />} />
            <Route path="add-exam"            element={<AddExam />} />
            <Route path="add-course"          element={<AddCourse />} />
            <Route path="smart-scheduling"    element={<SmartScheduling />} />
            <Route path="seating-manager"     element={<SeatingManager />} />
            <Route path="seating-arrangement" element={<SeatingArrangement />} />
            <Route path="pdf-reports"         element={<CourseSeatingPDF />} />
            <Route path="past-exams"          element={<PastExams />} />
          </Route>
        </Route>

        {/* INVIGILATOR: placeholder portal (requires JWT, any role) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/invigilator-portal" element={<InvigilatorPortal />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
