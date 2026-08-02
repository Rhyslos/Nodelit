// authentication imports
import crypto from 'crypto';
import db from '../database/Database.mjs';

// authentication classes
class Authentication {
    
    // cryptographic functions
    verifyPassword(password, salt, storedHash) {
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        
        const hashBuffer = Buffer.from(hash, 'hex');
        const storedBuffer = Buffer.from(storedHash, 'hex');
        
        if (hashBuffer.length !== storedBuffer.length) {
            return false;
        }
        
        return crypto.timingSafeEqual(hashBuffer, storedBuffer);
    }

    // route controllers
    login = (req, res) => {
        const { username, password } = req.body;
        const user = db.getUser(username);

        let isValid = false;

        if (user) {
            isValid = this.verifyPassword(password, user.salt, user.hash);
        } else {
            const dummySalt = crypto.randomBytes(16).toString('hex');
            const dummyHash = crypto.scryptSync('dummy_password', dummySalt, 64).toString('hex');
            this.verifyPassword(password, dummySalt, dummyHash); 
        }

        if (isValid && user) {
            const sessionId = db.createSession(user.id);

            res.cookie('session_id', sessionId, {
                httpOnly: true,
                secure: false, 
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000 
            });

            res.json({ id: user.id, username: user.username, role: user.role });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    }
  
    // middleware functions
    authenticate = (req, res, next) => {
        const sessionId = req.cookies?.session_id; 
        
        if (!sessionId) {
            return res.status(401).json({ error: 'Unauthenticated' });
        }

        const user = db.getUserBySession(sessionId);

        if (user) {
            req.user = user; 
            next();
        } else {
            res.status(401).json({ error: 'Unauthenticated' });
        }
    }
}

export default Authentication;