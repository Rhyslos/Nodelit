// import modules
import { useEffect, useRef, useCallback } from 'react';
import StickyNote from './StickyNote';

// configuration constants
const FLOAT_GUTTER = 16;

// utility functions
function contentBox(layer) {
    const editor = layer.querySelector('.tiptap');
    if (!editor) return null;

    const layerRect = layer.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const styles = window.getComputedStyle(editor);

    const left = editorRect.left - layerRect.left + parseFloat(styles.paddingLeft);
    const right = editorRect.right - layerRect.left - parseFloat(styles.paddingRight);
    const top = editorRect.top - layerRect.top + parseFloat(styles.paddingTop);

    return { left, right, top, width: right - left };
}

function floatFor(note, box) {
    const noteRight = note.x + note.width;

    if (noteRight <= box.left || note.x >= box.right) return null;

    const top = Math.max(0, Math.round(note.y - box.top));
    const height = Math.round(top + note.height);

    const center = note.x + note.width / 2;
    const side = center < (box.left + box.right) / 2 ? 'left' : 'right';

    const width = side === 'left'
        ? Math.round(Math.min(box.width, noteRight - box.left + FLOAT_GUTTER))
        : Math.round(Math.min(box.width, box.right - note.x + FLOAT_GUTTER));

    if (width <= 0 || height <= 0) return null;

    return { id: note.id, side, top, width, height };
}

// component functions
export default function StickyLayer({ editor, notes, editable, onUpdate, onDelete, children }) {
    const layerRef = useRef(null);

    const syncFloats = useCallback(() => {
        if (!editor || !layerRef.current) return;

        const box = contentBox(layerRef.current);

        const floats = box
            ? notes.filter(note => note.wrap).map(note => floatFor(note, box)).filter(Boolean)
            : [];

        editor.commands.setStickyFloats(floats);
    }, [editor, notes]);

    useEffect(() => {
        syncFloats();

        const observer = new ResizeObserver(syncFloats);
        if (layerRef.current) observer.observe(layerRef.current);

        return () => observer.disconnect();
    }, [syncFloats]);

    return (
        <div className="notation-sticky-layer" ref={layerRef}>
            {children}

            {notes.map(note => (
                <StickyNote
                    key={note.id}
                    note={note}
                    editable={editable}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
}
