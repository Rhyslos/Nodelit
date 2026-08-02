// hook imports
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useStream } from '../contexts/StreamContext';

// hook functions
export function useWorkspacePresence(workspaceID) {
    const { subscribe } = useStream();

    // state variables
    const [members, setMembers] = useState([]);

    // data fetching
    useEffect(() => {
        if (!workspaceID) {
            setMembers([]);
            return;
        }

        let active = true;

        api(`/api/network/members/${workspaceID}`)
            .then(data => { if (active) setMembers(data.members); })
            .catch(() => { if (active) setMembers([]); });

        return () => { active = false; };
    }, [workspaceID]);

    // stream subscription
    useEffect(() => {
        if (!workspaceID) return;

        return subscribe('presence', event => {
            if (event.workspaceID !== workspaceID) return;
            setMembers(event.members);
        });
    }, [workspaceID, subscribe]);

    return { members };
}
