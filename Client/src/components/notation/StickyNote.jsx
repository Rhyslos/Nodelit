// import modules
import { useState, useEffect, useRef, useCallback } from 'react';
import { STICKY_COLORS } from './Constants';
import { applyTextDiff } from '../../hooks/useStickyNotes';

// component functions
export default function StickyNote({ note, editable, onUpdate, onDelete }) {
    const [value, setValue] = useState(() => note.text?.toString() ?? '');
    const [menuOpen, setMenuOpen] = useState(false);
    const [drag, setDrag] = useState(null);

    const noteRef = useRef(null);

    // lifecycle functions
    useEffect(() => {
        const text = note.text;
        if (!text) return undefined;

        function sync() {
            const next = text.toString();
            setValue(current => (current === next ? current : next));
        }

        sync();
        text.observe(sync);

        return () => text.unobserve(sync);
    }, [note.text]);

    useEffect(() => {
        if (!menuOpen) return undefined;

        function dismiss(event) {
            if (noteRef.current?.contains(event.target)) return;
            setMenuOpen(false);
        }

        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
    }, [menuOpen]);

    // drag functions
    const beginDrag = useCallback((event, mode) => {
        if (!editable) return;

        event.preventDefault();
        event.stopPropagation();

        setDrag({
            mode,
            pointerX: event.clientX,
            pointerY: event.clientY,
            x: note.x,
            y: note.y,
            width: note.width,
            height: note.height
        });
    }, [editable, note.x, note.y, note.width, note.height]);

    useEffect(() => {
        if (!drag) return undefined;

        function move(event) {
            const deltaX = event.clientX - drag.pointerX;
            const deltaY = event.clientY - drag.pointerY;

            if (drag.mode === 'move') {
                onUpdate(note.id, { x: drag.x + deltaX, y: drag.y + deltaY });
                return;
            }

            onUpdate(note.id, { width: drag.width + deltaX, height: drag.height + deltaY });
        }

        function release() {
            setDrag(null);
        }

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', release);

        return () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', release);
        };
    }, [drag, note.id, onUpdate]);

    return (
        <div
            ref={noteRef}
            className={`notation-sticky ${drag ? 'dragging' : ''}`}
            style={{
                top: note.y,
                left: note.x,
                width: note.width,
                height: note.height,
                background: note.color
            }}
        >
            <div
                className="notation-sticky-bar"
                onPointerDown={event => beginDrag(event, 'move')}
            >
                {editable && (
                    <>
                        <button
                            className="notation-sticky-btn"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => setMenuOpen(open => !open)}
                            title="Note options"
                        >
                            ⋯
                        </button>

                        <button
                            className="notation-sticky-btn"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => onDelete(note.id)}
                            title="Delete note"
                        >
                            ✕
                        </button>
                    </>
                )}
            </div>

            {menuOpen && (
                <div className="notation-sticky-menu">
                    <div className="notation-sticky-swatches">
                        {STICKY_COLORS.map(color => (
                            <button
                                key={color}
                                className="notation-sticky-swatch"
                                style={{ background: color }}
                                onClick={() => {
                                    onUpdate(note.id, { color });
                                    setMenuOpen(false);
                                }}
                            />
                        ))}
                    </div>

                    <button
                        className="notation-sticky-option"
                        onClick={() => {
                            onUpdate(note.id, { wrap: !note.wrap });
                            setMenuOpen(false);
                        }}
                    >
                        {note.wrap ? 'Let text run behind' : 'Wrap text around'}
                    </button>
                </div>
            )}

            <textarea
                className="notation-sticky-text"
                value={value}
                readOnly={!editable}
                placeholder={editable ? 'Note…' : ''}
                onChange={event => {
                    setValue(event.target.value);
                    if (note.text) applyTextDiff(note.text, event.target.value);
                }}
            />

            {editable && (
                <div
                    className="notation-sticky-resize"
                    onPointerDown={event => beginDrag(event, 'resize')}
                />
            )}
        </div>
    );
}
