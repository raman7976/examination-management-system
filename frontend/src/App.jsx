import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AddExam from './pages/AddExam.jsx';
import AddCourse from './pages/AddCourse.jsx';
import SeatingManager from './pages/SeatingManager.jsx';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/forgotPassword" element={<ForgotPassword />} />
        <Route path="/dashboard" element={<Dashboard />}>
          {/* These are "Children" - they render inside the <Outlet /> */}
          <Route path="add-exam"        element={<AddExam />} />
          <Route path="add-course"      element={<AddCourse />} />
          <Route path="seating-manager" element={<SeatingManager />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;