// import modules
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import pool, { applySchema, closePool } from './database/Pool.mjs';
import db from './database/Database.mjs';
import Authentication from './modules/Authentication.mjs';
import Authorization from './modules/Authorization.mjs';
import createNetworkingRouter from './modules/Networking.mjs';
import createKanbanRouter from './api/KanbanAPI.mjs';
import createWorkspaceRouter from './api/WorkspaceAPI.mjs';
import createAdminRouter from './api/AdminAPI.mjs';

// configuration constants
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SHUTDOWN_GRACE_MS = 10000;
const HEALTH_CACHE_MS = 5000;
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_DIST = process.env.CLIENT_DIST
    ? path.resolve(process.env.CLIENT_DIST)
    : path.resolve(SERVER_DIR, '../Client/dist');

// environment functions
function readOrigins() {
    const raw = process.env.CLIENT_ORIGIN ?? '';
    const origins = raw.split(',').map(value => value.trim()).filter(Boolean);

    if (origins.length === 0) {
        if (IS_PRODUCTION) {
            throw new Error('CLIENT_ORIGIN must be set in production (comma separated list of allowed origins)');
        }
        return ['http://localhost:5173'];
    }

    return origins;
}

function validateEnvironment() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set');
    }
    return { origins: readOrigins() };
}

// server classes
class Server {
    constructor({ origins }) {
        this.app = express();
        this.origins = origins;
        this.port = Number(process.env.PORT ?? 3000);
        this.authn = new Authentication();
        this.authz = new Authorization();
        this.httpServer = null;
        this.healthy = true;
        this.healthCheckedAt = 0;

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    // middleware configuration
    setupMiddleware() {
        this.app.set('trust proxy', 1);
        this.app.disable('x-powered-by');

        this.app.use(helmet({
            crossOriginResourcePolicy: { policy: 'same-origin' },
            referrerPolicy: { policy: 'no-referrer' }
        }));

        this.app.use(cors({
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                if (this.origins.includes(origin)) return callback(null, true);
                return callback(null, false);
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Client-Id'],
            maxAge: 86400
        }));

        this.app.use(rateLimit({
            windowMs: 60 * 1000,
            limit: 600,
            standardHeaders: true,
            legacyHeaders: false,
            skip: req => req.path === '/healthz',
            message: { error: 'Too many requests. Please slow down.' }
        }));

        this.app.use(express.static(CLIENT_DIST, {
            index: false,
            maxAge: '1y',
            setHeaders: (res, filePath) => {
                if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
            }
        }));

        this.app.use(express.json({ limit: '64kb' }));
        this.app.use(cookieParser());
        this.app.use(this.csrfGuard());
    }

    // csrf configuration
    csrfGuard() {
        const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

        return (req, res, next) => {
            if (safeMethods.has(req.method)) return next();

            if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
                return res.status(403).json({ error: 'CSRF validation failed' });
            }

            const origin = req.headers.origin;
            if (origin && !this.origins.includes(origin)) {
                return res.status(403).json({ error: 'CSRF validation failed' });
            }

            next();
        };
    }

    // route configuration
    setupRoutes() {
        const loginLimiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 10,
            standardHeaders: true,
            legacyHeaders: false,
            skipSuccessfulRequests: true,
            message: { error: 'Too many login attempts. Please try again later.' }
        });

        this.app.get('/healthz', async (req, res) => {
            if (Date.now() - this.healthCheckedAt < HEALTH_CACHE_MS) {
                return res
                    .status(this.healthy ? 200 : 503)
                    .json({ status: this.healthy ? 'ok' : 'degraded' });
            }

            try {
                await pool.query('SELECT 1');
                this.healthy = true;
            } catch {
                this.healthy = false;
            }

            this.healthCheckedAt = Date.now();

            res.status(this.healthy ? 200 : 503)
               .json({ status: this.healthy ? 'ok' : 'degraded' });
        });

        // authentication routes
        this.app.post('/api/auth/login', loginLimiter, this.authn.login);
        this.app.post('/api/auth/logout', this.authn.logout);
        this.app.get('/api/auth/session', this.authn.authenticate, this.authn.session);

        // application routes
        this.app.use('/api/network', this.authn.authenticate, createNetworkingRouter(this.authz));
        this.app.use('/api/kanban', this.authn.authenticate, createKanbanRouter(this.authz));
        this.app.use('/api/workspaces', this.authn.authenticate, createWorkspaceRouter(this.authz));
        this.app.use('/api/admin', this.authn.authenticate, createAdminRouter(this.authz));

        this.setupClientRoutes();
    }

    // client configuration
    setupClientRoutes() {
        this.app.use((req, res, next) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            if (req.path.startsWith('/api')) return next();

            res.sendFile(path.join(CLIENT_DIST, 'index.html'), {
                headers: { 'Cache-Control': 'no-cache' }
            }, error => {
                if (error) next();
            });
        });

        this.app.use((req, res) => {
            res.status(404).json({ error: 'Not found' });
        });
    }

    // error handling configuration
    setupErrorHandling() {
        this.app.use((err, req, res, next) => {
            if (res.headersSent) return next(err);

            if (err.type === 'entity.parse.failed') {
                return res.status(400).json({ error: 'Malformed JSON body' });
            }

            if (err.type === 'entity.too.large') {
                return res.status(413).json({ error: 'Request body too large' });
            }

            const status = Number.isInteger(err.status) ? err.status : 500;

            if (status >= 500) {
                console.error('Unhandled server error:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            res.status(status).json({ error: err.message });
        });
    }

    // server initialization
    start() {
        this.httpServer = this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`Server listening on port ${this.port}`);
            console.log(`Serving client from ${CLIENT_DIST}`);
        });

        this.httpServer.headersTimeout = 65000;
        this.httpServer.keepAliveTimeout = 61000;

        return this.httpServer;
    }

    // shutdown functions
    async stop(signal) {
        console.log(`Received ${signal}, shutting down`);

        const forceExit = setTimeout(() => {
            console.error('Shutdown timed out, exiting');
            process.exit(1);
        }, SHUTDOWN_GRACE_MS);

        forceExit.unref?.();

        await new Promise(resolve => this.httpServer?.close(resolve));

        this.httpServer?.closeAllConnections?.();

        await closePool();
        clearTimeout(forceExit);
        process.exit(0);
    }
}

// application startup
async function main() {
    const config = validateEnvironment();

    await applySchema();
    await db.bootstrap();

    const server = new Server(config);
    server.start();

    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => server.stop(signal));
    }

    process.on('unhandledRejection', reason => {
        console.error('Unhandled rejection:', reason);
    });

    process.on('uncaughtException', error => {
        console.error('Uncaught exception:', error);
        process.exit(1);
    });
}

main().catch(error => {
    console.error('Startup failed:', error);
    process.exit(1);
});
