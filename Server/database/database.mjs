// database imports
import crypto from 'crypto';

// database mock
class Database {
    constructor() {
        this.users = new Map();
        this.sessions = new Map();
        this.initializeMockUser();
    }

    // user initialization
    initializeMockUser() {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync('k', salt, 64).toString('hex');
        
        this.users.set('test', {
            id: 1,
            username: 'test',
            salt: salt,
            hash: hash,
            role: 'admin'
        });
    }

    // session management functions
    createSession(userId) {
        // Generates a highly secure, random 64-character hex string
        const sessionId = crypto.randomBytes(32).toString('hex');
        this.sessions.set(sessionId, userId);
        return sessionId;
    }

    // database queries
    getUser(username) {
        return this.users.get(username);
    }

    getUserBySession(sessionId) {
        const userId = this.sessions.get(sessionId);
        if (!userId) return null;
        
        // Find the user by ID
        for (const user of this.users.values()) {
            if (user.id === userId) return user;
        }
        return null;
    }
}

export default new Database();