// import modules
import { useRef, useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { imageURL } from '../../lib/image';

// configuration constants
const MIN_WIDTH = 120;
const ALIGNMENTS = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Right' }
];

// component functions
export default function NotationImageView({ node, updateAttributes, deleteNode, editor }) {
    const { imageID, width, align, caption, ratio } = node.attrs;

    // state variables
    const [drag, setDrag] = useState(null);

    // dom references
    const figureRef = useRef(null);

    // lifecycle functions
    useEffect(() => {
        if (!drag) return undefined;

        function move(event) {
            const next = Math.max(MIN_WIDTH, drag.width + (event.clientX - drag.pointerX));
            updateAttributes({ width: Math.round(next) });
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
    }, [drag, updateAttributes]);

    // event handlers
    function beginResize(event) {
        if (!editor.isEditable) return;

        event.preventDefault();
        event.stopPropagation();

        const current = figureRef.current?.querySelector('img');

        setDrag({
            pointerX: event.clientX,
            width: width ?? current?.getBoundingClientRect().width ?? MIN_WIDTH
        });
    }

    return (
        <NodeViewWrapper
            className={`notation-image notation-image--${align ?? 'center'} ${drag ? 'is-resizing' : ''}`}
        >
            <figure ref={figureRef} style={{ width: width ? `${width}px` : undefined }}>
                <img
                    src={imageURL(imageID)}
                    alt={caption || 'Notation image'}
                    draggable={false}
                    style={{ aspectRatio: ratio || undefined }}
                />

                {editor.isEditable && (
                    <div className="notation-image-tools" contentEditable={false}>
                        {ALIGNMENTS.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                className={align === option.value ? 'active' : ''}
                                title={`Align ${option.label.toLowerCase()}`}
                                onClick={() => updateAttributes({ align: option.value })}
                            >
                                {option.label}
                            </button>
                        ))}

                        <button type="button" title="Reset size" onClick={() => updateAttributes({ width: null })}>
                            Reset
                        </button>

                        <button type="button" title="Remove image" onClick={deleteNode}>
                            Remove
                        </button>
                    </div>
                )}

                {editor.isEditable && (
                    <span
                        className="notation-image-resize"
                        onPointerDown={beginResize}
                    />
                )}

                <figcaption contentEditable={false}>
                    <input
                        className="notation-image-caption"
                        value={caption ?? ''}
                        readOnly={!editor.isEditable}
                        placeholder={editor.isEditable ? 'Add a caption…' : ''}
                        onChange={event => updateAttributes({ caption: event.target.value })}
                    />
                </figcaption>
            </figure>
        </NodeViewWrapper>
    );
}
