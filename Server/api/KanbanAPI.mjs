// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import { broadcastToWorkspace } from '../modules/networking.mjs';

// router configuration
export default function createKanbanRouter() {
    const router = Router();

    // retrieval routes
    router.get('/:workspaceID', (req, res) => {
        const { workspaceID } = req.params;
        
        const data = db.getWorkspaceData(workspaceID);
        
        res.json(data);
    });

    // update routes
    router.put('/tasks/:id', (req, res) => {
        const { id } = req.params;
        const { title, description, isCompleted, listID, taskOrder, updatedAt, workspaceID } = req.body;

        const result = db.updateTask(id, {
            title,
            description,
            isCompleted: isCompleted ? 1 : 0,
            listID,
            taskOrder
        }, updatedAt);

        // error handling
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        // broadcast functions
        broadcastToWorkspace(workspaceID, 'kanban_updated', { source: 'update_task', id });

        res.json({ success: true, newTimestamp: result.newTimestamp });
    });

    return router;
}