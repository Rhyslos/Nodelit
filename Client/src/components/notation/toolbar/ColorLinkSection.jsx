// import modules
import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorState } from '@tiptap/react';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../Constants';
import ColorPicker from '../ColorPicker';

// utility functions
function safeURL(value) {
    try {
        const url = new URL(value, window.location.origin);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

// component functions
export default function ColorLinkSection({ editor }) {
    const [activePicker, setActivePicker] = useState(null);
    const containerRef = useRef(null);

    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            isLink: instance.isActive('link'),
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

    const setLink = useCallback(() => {
        const previous = editor.getAttributes('link').href ?? '';
        const input = window.prompt('Enter URL', previous);

        if (input === null) return;

        if (input.trim() === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        const href = safeURL(input.trim());

        if (!href) {
            window.alert('That link is not a valid web address');
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }, [editor]);

    return (
        <div className="subbar-section" ref={containerRef} style={{ position: 'relative' }}>
            <button onClick={setLink} className={state.isLink ? 'active' : ''} title="Insert link">
                Link
            </button>

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
