// imports
import { Router } from 'express';

// state variables
const clients = new Map();
const activeWorkspaces = new Map();

// broadcast functions
export function broadcastToWorkspace(workspaceID, type, payload) {
    if (!workspaceID) return;
    
    activeWorkspaces.forEach((wsID, userId) => {
        if (wsID === workspaceID) {
            const userStreams = clients.get(userId);
            if (userStreams) {
                const dataString = JSON.stringify({ type, ...payload });
                userStreams.forEach(res => res.write(`data: ${dataString}\n\n`));
            }
        }
    });
}

// interval functions
setInterval(() => {
    clients.forEach(userStreams => {
        userStreams.forEach(res => res.write(':\n\n'));
    });
}, 15000);

// router configuration
export default function createNetworkingRouter() {
    const router = Router();

    // sse routes
    router.get('/stream/:userId', (req, res) => {
        const { userId } = req.params;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        if (!clients.has(userId)) clients.set(userId, new Set());
        clients.get(userId).add(res);

        res.write('retry: 3000\n\n');
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        // event handlers
        req.on('close', () => {
            const userStreams = clients.get(userId);
            if (userStreams) {
                userStreams.delete(res);
                if (userStreams.size === 0) {
                    clients.delete(userId);
                    activeWorkspaces.delete(userId);
                }
            }
        });
    });

    // api routes
    router.post('/presence', (req, res) => {
        const { userId, workspaceID } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (workspaceID) {
            activeWorkspaces.set(userId, workspaceID);
        } else {
            activeWorkspaces.delete(userId);
        }

        res.json({ success: true });
    });

    return router;
}