import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import HelpPage from './pages/HelpPage';
import MainPage from './pages/MainPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
