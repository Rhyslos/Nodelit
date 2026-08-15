// hook imports
import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';
import { STICKY_COLORS } from '../components/notation/Constants';

// configuration constants
const MAP_KEY = 'stickies';
const DEFAULT_WIDTH = 190;
const DEFAULT_HEIGHT = 160;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 90;

// utility functions
function newID() {
    return `sticky-${crypto.randomUUID()}`;
}

function snapshot(map) {
    const notes = [];

    map.forEach((note, id) => {
        if (!(note instanceof Y.Map)) return;

        notes.push({
            id,
            x: note.get('x') ?? 0,
            y: note.get('y') ?? 0,
            width: note.get('width') ?? DEFAULT_WIDTH,
            height: note.get('height') ?? DEFAULT_HEIGHT,
            color: note.get('color') ?? STICKY_COLORS[0],
            wrap: note.get('wrap') ?? false,
            text: note.get('text') ?? null
        });
    });

    return notes.sort((a, b) => a.id.localeCompare(b.id));
}

export function applyTextDiff(text, next) {
    const current = text.toString();
    if (current === next) return;

    let prefix = 0;
    const limit = Math.min(current.length, next.length);

    while (prefix < limit && current[prefix] === next[prefix]) prefix += 1;

    let suffix = 0;

    while (
        suffix < limit - prefix
        && current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) {
        suffix += 1;
    }

    const removed = current.length - prefix - suffix;
    const inserted = next.slice(prefix, next.length - suffix);

    text.doc.transact(() => {
        if (removed > 0) text.delete(prefix, removed);
        if (inserted.length > 0) text.insert(prefix, inserted);
    });
}

// hook functions
export function useStickyNotes(ydoc) {
    const [notes, setNotes] = useState([]);

    // lifecycle functions
    useEffect(() => {
        if (!ydoc) {
            setNotes([]);
            return undefined;
        }

        const map = ydoc.getMap(MAP_KEY);
        const update = () => setNotes(snapshot(map));

        update();
        map.observeDeep(update);

        return () => map.unobserveDeep(update);
    }, [ydoc]);

    // mutation functions
    const createNote = useCallback((position, color) => {
        if (!ydoc) return null;

        const map = ydoc.getMap(MAP_KEY);
        const id = newID();

        ydoc.transact(() => {
            const note = new Y.Map();
            map.set(id, note);

            note.set('x', Math.max(0, Math.round(position.x)));
            note.set('y', Math.max(0, Math.round(position.y)));
            note.set('width', DEFAULT_WIDTH);
            note.set('height', DEFAULT_HEIGHT);
            note.set('color', color ?? STICKY_COLORS[0]);
            note.set('wrap', false);
            note.set('text', new Y.Text());
        });

        return id;
    }, [ydoc]);

    const updateNote = useCallback((id, changes) => {
        if (!ydoc) return;

        const note = ydoc.getMap(MAP_KEY).get(id);
        if (!(note instanceof Y.Map)) return;

        ydoc.transact(() => {
            for (const [field, value] of Object.entries(changes)) {
                if (field === 'x' || field === 'y') note.set(field, Math.max(0, Math.round(value)));
                else if (field === 'width') note.set(field, Math.max(MIN_WIDTH, Math.round(value)));
                else if (field === 'height') note.set(field, Math.max(MIN_HEIGHT, Math.round(value)));
                else note.set(field, value);
            }
        });
    }, [ydoc]);

    const deleteNote = useCallback(id => {
        if (!ydoc) return;
        ydoc.getMap(MAP_KEY).delete(id);
    }, [ydoc]);

    return { notes, createNote, updateNote, deleteNote };
}
