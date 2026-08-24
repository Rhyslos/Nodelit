// import modules
import { useState, useRef } from 'react';
import { useEditorState } from '@tiptap/react';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../Constants';
import ColorPickerPopover from '../../colorpicker/ColorPickerPopover';
import { usePalette } from '../../../hooks/usePalette';

// component functions
export default function ColorSection({ editor }) {
    const { palette, saveColor, forgetColor } = usePalette();

    const [activePicker, setActivePicker] = useState(null);
    const [anchorRect, setAnchorRect] = useState(null);
    const containerRef = useRef(null);

    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => ({
            isHighlight: instance.isActive('highlight'),
            highlight: instance.getAttributes('highlight').color ?? null,
            color: instance.getAttributes('textStyle').color ?? null
        })
    });

    function togglePicker(kind, event) {
        setAnchorRect(event.currentTarget.getBoundingClientRect());
        setActivePicker(current => (current === kind ? null : kind));
    }

    function applyHighlight(color) {
        editor.chain().focus().toggleHighlight({ color }).run();
    }

    function clearHighlight() {
        editor.chain().focus().unsetHighlight().run();
        setActivePicker(null);
    }

    return (
        <div className="subbar-section" ref={containerRef} style={{ position: 'relative' }}>
            <button
                className={`tiptap-color-btn ${state.isHighlight ? 'active' : ''}`}
                onClick={event => togglePicker('highlight', event)}
                title="Highlight"
            >
                <span style={{ fontSize: '13px' }}>Highlight</span>
                <div className="tiptap-color-bar" style={{ backgroundColor: state.highlight ?? 'transparent' }} />
            </button>

            {activePicker === 'highlight' && (
                <ColorPickerPopover
                    anchorRect={anchorRect}
                    value={state.highlight ?? '#fff0a8'}
                    presets={HIGHLIGHT_COLORS}
                    saved={palette}
                    onCommit={applyHighlight}
                    onSave={saveColor}
                    onForget={forgetColor}
                    onClear={clearHighlight}
                    onClose={() => setActivePicker(null)}
                />
            )}

            <button
                className="tiptap-color-btn"
                onClick={event => togglePicker('text', event)}
                title="Text colour"
            >
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>A</span>
                <div className="tiptap-color-bar" style={{ backgroundColor: state.color ?? 'var(--ink)' }} />
            </button>

            {activePicker === 'text' && (
                <ColorPickerPopover
                    anchorRect={anchorRect}
                    align="right"
                    value={state.color ?? '#141414'}
                    presets={TEXT_COLORS}
                    saved={palette}
                    onCommit={color => editor.chain().focus().setColor(color).run()}
                    onSave={saveColor}
                    onForget={forgetColor}
                    onClear={() => {
                        editor.chain().focus().unsetColor().run();
                        setActivePicker(null);
                    }}
                    onClose={() => setActivePicker(null)}
                />
            )}
        </div>
    );
}
