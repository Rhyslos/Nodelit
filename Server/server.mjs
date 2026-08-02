// import modules
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import Authentication from './modules/Authentication.mjs';
import Authorization from './modules/Authorization.mjs';
import createNetworkingRouter from './modules/Networking.mjs';
import createKanbanRouter from './api/KanbanAPI.mjs';
import createWorkspaceRouter from './api/WorkspaceAPI.mjs';
import { ValidationError } from './modules/Validation.mjs';

// configuration constants
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// server classes
class Server {
    constructor() {
        this.app = express();
        this.port = PORT;
        this.authn = new Authentication();
        this.authz = new Authorization();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    // middleware configuration
    setupMiddleware() {
        this.app.disable('x-powered-by');
        if (process.env.TRUST_PROXY) this.app.set('trust proxy', Number(process.env.TRUST_PROXY));

        this.app.use(helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' }
        }));

        this.app.use(cors({
            origin: CLIENT_ORIGIN,
            credentials: true,
            allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Client-Id']
        }));

        this.app.use(express.json({ limit: '100kb' }));
        this.app.use(cookieParser());

        this.app.use((req, res, next) => {
            if (SAFE_METHODS.has(req.method)) return next();

            if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
                return res.status(403).json({ error: 'CSRF validation failed' });
            }

            next();
        });
    }

    // route configuration
    setupRoutes() {
        const loginLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 10,
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: 'Too many login attempts. Please try again later.' }
        });

        const apiLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: 600,
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: 'Too many requests. Please slow down.' }
        });

        // authentication routes
        this.app.post('/api/auth/login', loginLimiter, this.authn.login);
        this.app.post('/api/auth/logout', this.authn.logout);
        this.app.get('/api/auth/session', this.authn.authenticate, this.authn.session);

        // application routes
        this.app.use('/api/network', this.authn.authenticate, createNetworkingRouter(this.authz));
        this.app.use('/api/workspaces', apiLimiter, this.authn.authenticate, createWorkspaceRouter(this.authz));
        this.app.use('/api/kanban', apiLimiter, this.authn.authenticate, createKanbanRouter(this.authz));

        this.app.use('/api', (req, res) => {
            res.status(404).json({ error: 'Not found' });
        });
    }

    // error handling configuration
    setupErrorHandling() {
        this.app.use((err, req, res, next) => {
            if (err instanceof ValidationError) {
                return res.status(err.status).json({ error: err.message });
            }

            if (err?.type === 'entity.too.large') {
                return res.status(413).json({ error: 'Request body too large' });
            }

            if (err?.type === 'entity.parse.failed') {
                return res.status(400).json({ error: 'Malformed JSON body' });
            }

            console.error('Unhandled server error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        });
    }

    // server initialization
    start() {
        this.app.listen(this.port, () => {
            console.log(`Server listening on port ${this.port}`);
        });
    }
}

// application startup
const server = new Server();
server.start();
