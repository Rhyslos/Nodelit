// import modules
import { useState, useEffect, useRef } from 'react';
import { useEditorState } from '@tiptap/react';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../Constants';
import ColorPicker from '../ColorPicker';

// component functions
export default function ColorSection({ editor }) {
    const [activePicker, setActivePicker] = useState(null);
    const containerRef = useRef(null);

    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            isHighlight: instance.isActive('highlight'),
            highlight: instance.getAttributes('highlight').color ?? null,
            color: instance.getAttributes('textStyle').color ?? null
        })
    });

    useEffect(() => {
        if (!activePicker) return undefined;

        function dismiss(event) {
            if (containerRef.current?.contains(event.target)) return;
            setActivePicker(null);
        }

        document.addEventListener('mousedown', dismiss);
        return () => document.removeEventListener('mousedown', dismiss);
    }, [activePicker]);

    return (
        <div className="subbar-section" ref={containerRef} style={{ position: 'relative' }}>
            <button
                className={`tiptap-color-btn ${state.isHighlight ? 'active' : ''}`}
                onClick={() => setActivePicker(current => (current === 'highlight' ? null : 'highlight'))}
                title="Highlight"
            >
                <span style={{ fontSize: '13px' }}>Highlight</span>
                <div className="tiptap-color-bar" style={{ backgroundColor: state.highlight ?? 'transparent' }} />
            </button>

            {activePicker === 'highlight' && (
                <ColorPicker
                    colors={HIGHLIGHT_COLORS}
                    onSelect={color => {
                        if (color === '#FFFFFF') editor.chain().focus().unsetHighlight().run();
                        else editor.chain().focus().toggleHighlight({ color }).run();
                        setActivePicker(null);
                    }}
                />
            )}

            <button
                className="tiptap-color-btn"
                onClick={() => setActivePicker(current => (current === 'text' ? null : 'text'))}
                title="Text colour"
            >
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>A</span>
                <div className="tiptap-color-bar" style={{ backgroundColor: state.color ?? 'var(--ink)' }} />
            </button>

            {activePicker === 'text' && (
                <ColorPicker
                    colors={TEXT_COLORS}
                    onSelect={color => {
                        editor.chain().focus().setColor(color).run();
                        setActivePicker(null);
                    }}
                    style={{
                        right: 0,
                        left: 'auto',
                        transform: 'none',
                        gridTemplateColumns: 'repeat(5, 1fr)'
                    }}
                />
            )}
        </div>
    );
}
