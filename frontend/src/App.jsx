import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddExam from './pages/AddExam.jsx';
import AddCourse from './pages/AddCourse.jsx';
import SmartScheduling from './pages/SmartScheduling.jsx';
import SeatingManager from './pages/SeatingManager.jsx';
import SeatingArrangement from './pages/SeatingArrangement.jsx';
import InvigilatorScheduling from './pages/InvigilatorScheduling.jsx';
import SwapApproval from './pages/SwapApproval.jsx';
import CourseSeatingPDF from './pages/CourseSeatingPDF.jsx';
import PastExams from './pages/PastExams.jsx';
import Registration from './pages/Registration.jsx';
import InvigilatorPortal from './pages/InvigilatorPortal.jsx';
import MySchedule from './pages/invigilator/MySchedule.jsx';
import IncomingRequests from './pages/invigilator/IncomingRequests.jsx';
import OutgoingRequests from './pages/invigilator/OutgoingRequests.jsx';
import Profile from './pages/invigilator/Profile.jsx';
import AdminRoute from './components/AdminRoute';
import InvigilatorRoute from './components/InvigilatorRoute.jsx';
import { PeriodProvider } from './context/PeriodContext.jsx';
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
          <Route path="/dashboard" element={<PeriodProvider><Dashboard /></PeriodProvider>}>
            <Route path="registration"           element={<Registration />} />
            <Route path="add-exam"               element={<AddExam />} />
            <Route path="add-course"             element={<AddCourse />} />
            <Route path="smart-scheduling"       element={<SmartScheduling />} />
            <Route path="seating-manager"        element={<SeatingManager />} />
            <Route path="seating-arrangement"    element={<SeatingArrangement />} />
            <Route path="invigilator-scheduling" element={<InvigilatorScheduling />} />
            <Route path="swap-approval"          element={<SwapApproval />} />
            <Route path="pdf-reports"            element={<CourseSeatingPDF />} />
            <Route path="past-exams"             element={<PastExams />} />
          </Route>
        </Route>

        {/* INVIGILATOR PORTAL: sidebar layout + 4 tabs (faculty / phd_student / lab_staff) */}
        <Route element={<InvigilatorRoute />}>
          <Route path="/invigilator-portal" element={<InvigilatorPortal />}>
            <Route index               element={<Navigate to="schedule" replace />} />
            <Route path="schedule"     element={<MySchedule />} />
            <Route path="incoming"     element={<IncomingRequests />} />
            <Route path="outgoing"     element={<OutgoingRequests />} />
            <Route path="profile"      element={<Profile />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
