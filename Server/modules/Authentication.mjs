// authentication imports
import crypto from 'crypto';
import { promisify } from 'node:util';
import db from '../database/Database.mjs';
import { requirePassword } from './Validation.mjs';

const scrypt = promisify(crypto.scrypt);

// configuration constants
const SESSION_COOKIE = 'session_id';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_CREDENTIAL_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const MAX_AUDIT_TARGET_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const LOCKOUT_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_USERNAME = 10;
const MAX_FAILURES_PER_IP = 40;

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

// authentication classes
class Authentication {
    constructor() {
        this.decoyReady = this.buildDecoy();
        this.decoyReady.catch(() => {});
    }

    // cryptographic functions
    async buildDecoy() {
        const password = crypto.randomBytes(32).toString('hex');
        return this.hashPassword(password);
    }

    async hashPassword(password) {
        const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
        const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
        return { salt, hash: derived.toString('hex') };
    }

    async verifyPassword(password, salt, storedHash) {
        const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
        const storedBuffer = Buffer.from(storedHash, 'hex');

        if (derived.length !== storedBuffer.length) return false;

        return crypto.timingSafeEqual(derived, storedBuffer);
    }

    // validation functions
    isUsableCredential(value) {
        return typeof value === 'string'
            && value.length > 0
            && value.length <= MAX_CREDENTIAL_LENGTH
            && !CONTROL_CHARACTERS.test(value);
    }

    auditTarget(username) {
        return username.toLowerCase().slice(0, MAX_AUDIT_TARGET_LENGTH);
    }

    // route controllers
    login = async (req, res, next) => {
        try {
            const { username, password } = req.body ?? {};
            const ip = req.ip;

            if (!this.isUsableCredential(username) || !this.isUsableCredential(password)) {
                await db.recordAudit({
                    action: 'login.failed',
                    targetType: 'username',
                    targetID: typeof username === 'string' ? this.auditTarget(username) : null,
                    detail: { reason: 'malformed credential' },
                    ip
                });

                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const failures = await db.countRecentLoginFailures({
                username,
                ip,
                minutes: LOCKOUT_WINDOW_MINUTES
            });

            if (failures.byUsername >= MAX_FAILURES_PER_USERNAME || failures.byIP >= MAX_FAILURES_PER_IP) {
                await db.recordAudit({
                    action: 'login.blocked',
                    targetType: 'username',
                    targetID: this.auditTarget(username),
                    detail: failures,
                    ip
                });

                return res.status(429).json({
                    error: 'Too many failed attempts. Please try again in a few minutes.'
                });
            }

            const user = await db.getUserByUsername(username);
            const credential = user ?? await this.decoyReady;
            const isValid = await this.verifyPassword(password, credential.salt, credential.hash);

            if (!user || !isValid) {
                await db.recordAudit({
                    action: 'login.failed',
                    targetType: 'username',
                    targetID: this.auditTarget(username),
                    ip
                });

                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const previousSession = req.cookies?.[SESSION_COOKIE];
            if (previousSession) await db.deleteSession(previousSession);

            const sessionID = await db.createSession(user.id);
            res.cookie(SESSION_COOKIE, sessionID, COOKIE_OPTIONS);

            await db.recordAudit({
                actorID: user.id,
                actorName: user.username,
                action: 'login.success',
                targetType: 'user',
                targetID: user.id,
                ip
            });

            res.json(db.toPublicUser(user));
        } catch (error) {
            next(error);
        }
    }

    logout = async (req, res, next) => {
        try {
            const sessionID = req.cookies?.[SESSION_COOKIE];

            if (typeof sessionID === 'string' && sessionID.length === 64) {
                const removed = await db.deleteSession(sessionID);

                if (removed) {
                    await db.recordAudit({
                        actorID: req.user?.id,
                        actorName: req.user?.username,
                        action: 'logout',
                        ip: req.ip
                    });
                }
            }

            res.clearCookie(SESSION_COOKIE, { ...COOKIE_OPTIONS, maxAge: undefined });
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    }

    changePassword = async (req, res, next) => {
        try {
            const current = req.body?.currentPassword;
            const proposed = requirePassword(req.body?.newPassword, 'newPassword');

            if (!this.isUsableCredential(current)) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            const credentials = await db.getCredentials(req.user.id);
            const valid = credentials
                ? await this.verifyPassword(current, credentials.salt, credentials.hash)
                : false;

            if (!valid) {
                await db.recordAudit({
                    actorID: req.user.id,
                    actorName: req.user.username,
                    action: 'password.change_failed',
                    ip: req.ip
                });

                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            await db.setUserPassword(req.user.id, proposed);
            await db.deleteSessionsForUser(req.user.id);

            const sessionID = await db.createSession(req.user.id);
            res.cookie(SESSION_COOKIE, sessionID, COOKIE_OPTIONS);

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'password.changed',
                ip: req.ip
            });

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
