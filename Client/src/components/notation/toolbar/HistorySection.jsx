// component functions
export default function HistorySection({ editor }) {
    const commands = editor.can();

    return (
        <div className="subbar-section">
            <button
                onClick={() => editor.chain().focus().undo?.().run()}
                disabled={!commands.undo?.()}
                title="Undo"
            >
                ⮪
            </button>
            <button
                onClick={() => editor.chain().focus().redo?.().run()}
                disabled={!commands.redo?.()}
                title="Redo"
            >
                ⮫
            </button>
        </div>
    );
}
