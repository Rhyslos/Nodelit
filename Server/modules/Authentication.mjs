// authentication imports
import crypto from 'crypto';
import db from '../database/renameforthesakeoffixingatype.mjs';

// configuration constants
const SESSION_COOKIE = 'session_id';
const KEY_LENGTH = 64;
const MAX_CREDENTIAL_LENGTH = 200;

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

// authentication classes
class Authentication {

    // cryptographic functions
    hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
        return { salt, hash };
    }

    verifyPassword(password, salt, storedHash) {
        const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');

        const hashBuffer = Buffer.from(hash, 'hex');
        const storedBuffer = Buffer.from(storedHash, 'hex');

        if (hashBuffer.length !== storedBuffer.length) return false;

        return crypto.timingSafeEqual(hashBuffer, storedBuffer);
    }

    // validation functions
    isUsableCredential(value) {
        return typeof value === 'string'
            && value.length > 0
            && value.length <= MAX_CREDENTIAL_LENGTH;
    }

    // route controllers
    login = async (req, res, next) => {
        try {
            const { username, password } = req.body ?? {};

            if (!this.isUsableCredential(username) || !this.isUsableCredential(password)) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = await db.getUserByUsername(username);

            let isValid = false;

            if (user) {
                isValid = this.verifyPassword(password, user.salt, user.hash);
            } else {
                const decoy = this.hashPassword('decoy_password');
                this.verifyPassword(password, decoy.salt, decoy.hash);
            }

            if (!isValid || !user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const previousSession = req.cookies?.[SESSION_COOKIE];
            if (previousSession) await db.deleteSession(previousSession);

            const sessionID = await db.createSession(user.id);
            res.cookie(SESSION_COOKIE, sessionID, COOKIE_OPTIONS);

            res.json(db.toPublicUser(user));
        } catch (error) {
            next(error);
        }
    }

    logout = async (req, res, next) => {
        try {
            const sessionID = req.cookies?.[SESSION_COOKIE];
            if (sessionID) await db.deleteSession(sessionID);

            res.clearCookie(SESSION_COOKIE, { ...COOKIE_OPTIONS, maxAge: undefined });
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    }

    session = (req, res) => {
        res.json(db.toPublicUser(req.user));
    }

    // middleware functions
    authenticate = async (req, res, next) => {
        try {
            const sessionID = req.cookies?.[SESSION_COOKIE];

            if (typeof sessionID !== 'string' || sessionID.length !== 64) {
                return res.status(401).json({ error: 'Unauthenticated' });
            }

            const user = await db.getUserBySession(sessionID);

            if (!user) {
                res.clearCookie(SESSION_COOKIE, { ...COOKIE_OPTIONS, maxAge: undefined });
                return res.status(401).json({ error: 'Unauthenticated' });
            }

            req.user = user;
            next();
        } catch (error) {
            next(error);
        }
    }
}

export default Authentication;
