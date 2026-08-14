// import modules
import { useEditorState } from '@tiptap/react';

// configuration constants
const LISTS = [
    { name: 'bulletList', command: 'toggleBulletList', title: 'Bullet list', label: '• List' },
    { name: 'orderedList', command: 'toggleOrderedList', title: 'Numbered list', label: '1. List' },
    { name: 'taskList', command: 'toggleTaskList', title: 'Task list', label: '☑ Tasks' }
];

// component functions
export default function ListSection({ editor }) {
    const active = useEditorState({
        editor,
        selector: ({ editor: instance }) =>
            LISTS.map(list => instance.isActive(list.name)).join('|')
    });

    const states = active.split('|');

    return (
        <div className="subbar-section">
            {LISTS.map((list, index) => (
                <button
                    key={list.name}
                    onClick={() => editor.chain().focus()[list.command]().run()}
                    className={states[index] === 'true' ? 'active' : ''}
                    title={list.title}
                >
                    {list.label}
                </button>
            ))}

            <button onClick={() => editor.commands.outdentBlock()} title="Decrease indent">
                ⇤
            </button>

            <button onClick={() => editor.commands.indentBlock()} title="Increase indent">
                ⇥
            </button>
        </div>
    );
}
