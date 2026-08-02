// import modules
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import Authentication from './modules/Authentication.mjs';
import Authorization from './modules/Authorization.mjs';

// server classes
class Server {
  constructor() {
    this.app = express();
    this.port = 3000;
    this.authn = new Authentication();
    this.authz = new Authorization();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  // middleware configuration
  setupMiddleware() {
    this.app.use(helmet());
    
    this.app.use(cors({ 
        origin: 'http://localhost:5173',
        credentials: true
    }));
    
    this.app.use(express.json({ limit: '10kb' }));
    
    this.app.use(cookieParser());
    
    this.app.use((req, res, next) => {
        if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
            return res.status(403).json({ error: 'CSRF validation failed' });
        }
        next();
    });
  }

  // route configuration
  setupRoutes() {
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, 
        max: 5, 
        message: { error: 'Too many login attempts. Please try again later.' }
    });

    this.app.post('/api/login', loginLimiter, this.authn.login);

    this.app.get(
      '/api/protected', 
      this.authn.authenticate, 
      this.authz.authorize, 
      (req, res) => {
        res.send('Secure data accessed');
      }
    );
  }

  // error handling configuration
  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
        console.error('Unhandled server error:', err.message);
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