// import modules
import { useEditorState } from '@tiptap/react';

// configuration constants
const MARKS = [
    { name: 'bold', command: 'toggleBold', title: 'Bold', content: <b>B</b> },
    { name: 'italic', command: 'toggleItalic', title: 'Italic', content: <i>I</i> },
    { name: 'underline', command: 'toggleUnderline', title: 'Underline', content: <u>U</u> },
    { name: 'strike', command: 'toggleStrike', title: 'Strikethrough', content: <s>S</s> },
    { name: 'subscript', command: 'toggleSubscript', title: 'Subscript', content: 'X₂' },
    { name: 'superscript', command: 'toggleSuperscript', title: 'Superscript', content: 'X²' }
];

// component functions
export default function FormattingSection({ editor }) {
    const active = useEditorState({
        editor,
        selector: ({ editor: instance }) =>
            MARKS.map(mark => instance.isActive(mark.name)).join('|')
    });

    const states = active.split('|');

    return (
        <div className="subbar-section">
            {MARKS.map((mark, index) => (
                <button
                    key={mark.name}
                    onClick={() => editor.chain().focus()[mark.command]().run()}
                    className={states[index] === 'true' ? 'active' : ''}
                    title={mark.title}
                >
                    {mark.content}
                </button>
            ))}
        </div>
    );
}
