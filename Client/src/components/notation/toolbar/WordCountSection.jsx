// import modules
import { useEditorState } from '@tiptap/react';

// component functions
export default function WordCountSection({ editor }) {
    const words = useEditorState({
        editor,
        selector: ({ editor: instance }) => instance?.storage.characterCount?.words() ?? 0
    });

    return (
        <div className="subbar-section notation-word-count">
            {words} {words === 1 ? 'word' : 'words'}
        </div>
    );
}
