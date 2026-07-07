import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Typography } from 'antd';
import { getToken } from './api/client';
import LoginPage from './pages/LoginPage';
import SpacesPage from './pages/SpacesPage';
import SpacePage from './pages/SpacePage';
import DocPage from './pages/DocPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<SpacesPage />} />
            <Route path="/s/:spaceId" element={<SpacePage />}>
              <Route
                index
                element={
                  <Typography.Text type="secondary" style={{ display: 'block', padding: 48, textAlign: 'center' }}>
                    从左侧选择或创建一篇文档
                  </Typography.Text>
                }
              />
              <Route path="d/:nodeId" element={<DocPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
