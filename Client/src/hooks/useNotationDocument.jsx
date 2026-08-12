// hook imports
import { useState, useEffect } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { socketBase } from '../lib/api';

// configuration constants
const SOCKET_PATH = '/api/notation/socket';

// hook functions
export function useNotationDocument(pageID) {
    // state variables
    const [session, setSession] = useState(null);
    const [connected, setConnected] = useState(false);
    const [synced, setSynced] = useState(false);

    // lifecycle functions
    useEffect(() => {
        if (!pageID) {
            setSession(null);
            setConnected(false);
            setSynced(false);
            return undefined;
        }

        let active = true;

        const ydoc = new Y.Doc();
        const provider = new WebsocketProvider(`${socketBase()}${SOCKET_PATH}`, pageID, ydoc, {
            disableBc: true,
            maxBackoffTime: 10000
        });

        const onStatus = event => {
            if (active) setConnected(event.status === 'connected');
        };

        const onSync = isSynced => {
            if (active) setSynced(isSynced);
        };

        provider.on('status', onStatus);
        provider.on('sync', onSync);

        setSession({ pageID, ydoc, provider });
        setConnected(false);
        setSynced(false);

        return () => {
            active = false;
            provider.off('status', onStatus);
            provider.off('sync', onSync);
            provider.destroy();
            ydoc.destroy();
        };
    }, [pageID]);

    const ready = Boolean(session) && session.pageID === pageID;

    return {
        session: ready ? session : null,
        connected,
        synced: synced && connected,
        status: !ready ? 'loading' : connected ? (synced ? 'synced' : 'syncing') : 'offline'
    };
}
