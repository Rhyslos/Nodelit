// authentication classes
class Authentication {
  
  // middleware functions
  authenticate(req, res, next) {
    const isAuthenticated = true; 
    
    if (isAuthenticated) {
      next();
    } else {
      res.status(401).json({ error: 'Unauthenticated' });
    }
  }
}

export default Authentication;