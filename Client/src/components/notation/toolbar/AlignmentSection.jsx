// import modules
import { useEditorState } from '@tiptap/react';

// configuration constants
const ALIGNMENTS = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' }
];

// component functions
export default function AlignmentSection({ editor }) {
    const active = useEditorState({
        editor,
        selector: ({ editor: instance }) =>
            ALIGNMENTS.map(alignment => instance.isActive({ textAlign: alignment.value })).join('|')
    });

    const states = active.split('|');

    return (
        <div className="subbar-section">
            {ALIGNMENTS.map((alignment, index) => (
                <button
                    key={alignment.value}
                    onClick={() => editor.chain().focus().setTextAlign(alignment.value).run()}
                    className={states[index] === 'true' ? 'active' : ''}
                    title={`Align ${alignment.label.toLowerCase()}`}
                >
                    {alignment.label}
                </button>
            ))}
        </div>
    );
}
