// component imports
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { StreamProvider } from './contexts/StreamContext';
import { ToastProvider } from './contexts/ToastContext';
import { KanbanProvider } from './contexts/KanbanContext';
import { NotationProvider } from './contexts/NotationContext';
import Navbar from './components/navbar/Navbar';
import ToastStack from './components/toast/ToastStack';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Kanban from './pages/Kanban';
import Notation from './pages/Notation';
import Calendar from './pages/Calendar';
import Admin from './pages/Admin';
import Profile from './pages/Profile';

// application constants
export const appName = 'Nodelit';

// guard components
function ProtectedRoute() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <div className="route-loading">Loading…</div>;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

    return <Outlet />;
}

function AdminRoute() {
    const { user, loading } = useAuth();

    if (loading) return <div className="route-loading">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;

    return <Outlet />;
}

function PublicRoute() {
    const { user, loading } = useAuth();

    if (loading) return <div className="route-loading">Loading…</div>;
    if (user) return <Navigate to="/dashboard" replace />;

    return <Outlet />;
}

// layout functions
function WorkspaceLayout() {
    return (
        <KanbanProvider>
            <Outlet />
        </KanbanProvider>
    );
}

function NotationLayout() {
    return (
        <NotationProvider>
            <Outlet />
        </NotationProvider>
    );
}

function AppLayout() {
    const location = useLocation();
    const hideNavbar = location.pathname === '/login';

    return (
        <>
            {!hideNavbar && <Navbar />}
            <ToastStack />
            <Routes>
                <Route element={<PublicRoute />}>
                    <Route path="/login" element={<Login />} />
                </Route>

                <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<Admin />} />
                </Route>

                <Route element={<ProtectedRoute />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/profile" element={<Profile />} />

                    <Route path="/workspace/:workspaceID" element={<WorkspaceLayout />}>
                        <Route index element={<Navigate to="kanban" replace />} />
                        <Route path="kanban" element={<Kanban />} />
                        <Route path="calendar" element={<Calendar />} />

                        <Route element={<NotationLayout />}>
                            <Route path="notation" element={<Notation />} />
                        </Route>
                    </Route>
                </Route>

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </>
    );
}

// component functions
function App() {
    return (
        <AuthProvider>
            <ThemeProvider>
                <ToastProvider>
                    <StreamProvider>
                        <BrowserRouter>
                            <AppLayout />
                        </BrowserRouter>
                    </StreamProvider>
                </ToastProvider>
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
