// authorization classes
class Authorization {
  
  // middleware functions
  authorize(req, res, next) {
    const hasPermission = true; 
    
    if (hasPermission) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  }
}

export default Authorization;