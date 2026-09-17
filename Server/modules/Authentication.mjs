// authentication imports
import crypto from 'crypto';
import { promisify } from 'node:util';
import db, { SCRYPT_OPTIONS } from '../database/Database.mjs';
import { requirePassword, requireText, optionalColor, optionalTheme, optionalPalette } from './Validation.mjs';
import { revalidateStreams } from './Networking.mjs';
import { revalidateCollaboration } from './Collaboration.mjs';

const scrypt = promisify(crypto.scrypt);

// configuration constants
const SESSION_COOKIE = 'session_id';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_CREDENTIAL_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const MAX_AUDIT_TARGET_LENGTH = 64;

const LOCKOUT_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_USERNAME_AND_IP = 10;
const MAX_FAILURES_PER_USERNAME = 100;
const MAX_FAILURES_PER_IP = 40;
const MAX_FALLBACK_KEYS = 10000;

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
        this.fallbackFailures = new Map();

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

    // revocation functions
    cutLiveConnections() {
        revalidateStreams();
        revalidateCollaboration();
    }

    // lockout functions
    fallbackKeys(target, ip) {
        return {
            byUsernameAndIP: `pair:${target}:${ip}`,
            byUsername: `user:${target}`,
            byIP: `ip:${ip}`
        };
    }

    recentFallback(key, now) {
        const cutoff = now - LOCKOUT_WINDOW_MINUTES * 60 * 1000;
        const entries = (this.fallbackFailures.get(key) ?? []).filter(at => at > cutoff);

        if (entries.length === 0) this.fallbackFailures.delete(key);
        else this.fallbackFailures.set(key, entries);

        return entries.length;
    }

    rememberFailure(target, ip) {
        const now = Date.now();

        if (this.fallbackFailures.size >= MAX_FALLBACK_KEYS) {
            for (const key of [...this.fallbackFailures.keys()]) this.recentFallback(key, now);
        }

        if (this.fallbackFailures.size >= MAX_FALLBACK_KEYS) {
            const oldest = this.fallbackFailures.keys().next().value;
            this.fallbackFailures.delete(oldest);
        }

        for (const key of Object.values(this.fallbackKeys(target, ip))) {
            this.fallbackFailures.set(key, [...(this.fallbackFailures.get(key) ?? []), now]);
        }
    }

    async recordFailure(entry, target, ip) {
        const recorded = await db.recordAudit({ ...entry, action: 'login.failed', targetType: 'username', targetID: target, ip });
        if (!recorded) this.rememberFailure(target ?? '', ip);
    }

    async countFailures(username, ip) {
        const stored = await db.countRecentLoginFailures({ username, ip, minutes: LOCKOUT_WINDOW_MINUTES });
        const keys = this.fallbackKeys(this.auditTarget(username), ip);
        const now = Date.now();

        return {
            byUsernameAndIP: stored.byUsernameAndIP + this.recentFallback(keys.byUsernameAndIP, now),
            byUsername: stored.byUsername + this.recentFallback(keys.byUsername, now),
            byIP: stored.byIP + this.recentFallback(keys.byIP, now)
        };
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
                await this.recordFailure(
                    { detail: { reason: 'malformed credential' } },
                    typeof username === 'string' ? this.auditTarget(username) : null,
                    ip
                );

                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const failures = await this.countFailures(username, ip);

            const blocked = failures.byUsernameAndIP >= MAX_FAILURES_PER_USERNAME_AND_IP
                || failures.byUsername >= MAX_FAILURES_PER_USERNAME
                || failures.byIP >= MAX_FAILURES_PER_IP;

            if (blocked) {
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
                await this.recordFailure({}, this.auditTarget(username), ip);

                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const previousSession = req.cookies?.[SESSION_COOKIE];

            if (typeof previousSession === 'string' && previousSession.length === 64) {
                if (await db.deleteSession(previousSession)) this.cutLiveConnections();
            }

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
                const actor = await db.getUserBySession(sessionID);
                const removed = await db.deleteSession(sessionID);

                if (removed) {
                    this.cutLiveConnections();

                    await db.recordAudit({
                        actorID: actor?.id,
                        actorName: actor?.username,
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
                return res.status(400).json({ error: 'Current password is incorrect' });
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

                return res.status(400).json({ error: 'Current password is incorrect' });
            }

            await db.setUserPassword(req.user.id, proposed);
            await db.deleteSessionsForUser(req.user.id);

            const sessionID = await db.createSession(req.user.id);
            res.cookie(SESSION_COOKIE, sessionID, COOKIE_OPTIONS);

            this.cutLiveConnections();

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

    updateProfile = async (req, res, next) => {
        try {
            const changes = {
                displayName: req.body?.displayName === undefined
                    ? undefined
                    : requireText(req.body.displayName, 'displayName', 80),
                cursorColor: optionalColor(req.body?.cursorColor, 'cursorColor'),
                theme: optionalTheme(req.body?.theme, 'theme'),
                palette: optionalPalette(req.body?.palette, 'palette')
            };

            const user = await db.updateProfile(req.user.id, changes);
            if (!user) return res.status(404).json({ error: 'Not found' });

            res.json(db.toPublicUser(user));
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
