// component imports
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, matchPath } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { StreamProvider } from './contexts/StreamContext';
import { ToastProvider } from './contexts/ToastContext';
import { KanbanProvider } from './contexts/KanbanContext';
import { NotationProvider } from './contexts/NotationContext';
import Navbar from './components/navbar/Navbar';
import ToastStack from './components/toast/ToastStack';
import { useWorkspaces } from './hooks/useWorkspaces';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// lazily loaded pages, so the first load only ships what the login and dashboard need
const Overview = lazy(() => import('./pages/Overview'));
const Kanban = lazy(() => import('./pages/Kanban'));
const Notation = lazy(() => import('./pages/Notation'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Admin = lazy(() => import('./pages/Admin'));
const Profile = lazy(() => import('./pages/Profile'));
const Privacy = lazy(() => import('./pages/Privacy'));

// application constants
export const appName = 'Nodelit';

const PAGE_TITLES = {
    overview: 'Overview',
    kanban: 'Kanban',
    notation: 'Notation',
    calendar: 'Calendar',
    dashboard: 'Dashboard',
    profile: 'Profile',
    admin: 'Admin',
    privacy: 'Privacy',
    login: 'Sign in'
};

// title components
function DocumentTitle() {
    const { user } = useAuth();
    const location = useLocation();
    const { workspaces } = useWorkspaces(user?.id);

    const match = matchPath({ path: '/workspace/:workspaceID/:page' }, location.pathname);
    const page = match?.params?.page ?? location.pathname.split('/')[1];
    const workspaceName = match
        ? workspaces.find(workspace => workspace.id === match.params.workspaceID)?.name
        : null;

    const title = [PAGE_TITLES[page], workspaceName, appName].filter(Boolean).join(' · ');

    useEffect(() => {
        document.title = title;
    }, [title]);

    return null;
}

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
    const { user } = useAuth();
    const location = useLocation();
    const hideNavbar = location.pathname === '/login' || (location.pathname === '/privacy' && !user);

    return (
        <>
            <DocumentTitle />
            {!hideNavbar && <Navbar />}
            <ToastStack />
            <Suspense fallback={<div className="route-loading">Loading…</div>}>
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
                        <Route path="overview" element={<Overview />} />
                        <Route path="kanban" element={<Kanban />} />
                        <Route path="calendar" element={<Calendar />} />

                        <Route element={<NotationLayout />}>
                            <Route path="notation" element={<Notation />} />
                        </Route>
                    </Route>
                </Route>

                <Route path="/privacy" element={<Privacy />} />

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </Suspense>
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
