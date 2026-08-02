// server imports
import express from 'express';
import cors from 'cors';
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
  }

  // middleware configuration
  setupMiddleware() {
    this.app.use(cors({ origin: 'http://localhost:5173' }));
    this.app.use(express.json());
  }

  // route configuration
  setupRoutes() {
    this.app.post('/api/login', this.authn.login);

    this.app.get(
      '/api/protected', 
      this.authn.authenticate, 
      this.authz.authorize, 
      (req, res) => {
        res.send('Secure data accessed');
      }
    );
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