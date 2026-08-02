// database imports
import crypto from 'crypto';

// database mock
class Database {
    constructor() {
        this.users = new Map();
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

    // database queries
    getUser(username) {
        return this.users.get(username);
    }
}

export default new Database();