// import modules
import express from 'express';
import Authentication from './Authentication.mjs';
import Authorization from './Authorization.mjs';

// server classes
class Server {
  constructor() {
    this.app = express();
    this.port = 3000;
    this.authn = new Authentication();
    this.authz = new Authorization();
    
    this.setupRoutes();
  }

  // route functions
  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.send('Server is running');
    });

    this.app.get(
      '/protected', 
      this.authn.authenticate, 
      this.authz.authorize, 
      (req, res) => {
        res.send('You have accessed a secure route');
      }
    );
  }

  // server functions
  start() {
    this.app.listen(this.port, () => {
      console.log(`Server listening on port ${this.port}`);
    });
  }
}

// initialization functions
const server = new Server();
server.start();