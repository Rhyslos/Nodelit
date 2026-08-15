// import modules
import ToolbarOverflow from './toolbar/ToolbarOverflow';
import InsertMenu from './toolbar/InsertMenu';
import ViewMenu from './toolbar/ViewMenu';
import StyleSection from './toolbar/StyleSection';
import FormattingSection from './toolbar/FormattingSection';
import ListSection from './toolbar/ListSection';
import ColorSection from './toolbar/ColorSection';
import AlignmentSection from './toolbar/AlignmentSection';
import WordCountSection from './toolbar/WordCountSection';

// component functions
export default function TipTapToolbar({ editor, view }) {
    if (!editor) return null;

    if (view.reading || !view.canEdit) {
        return (
            <ToolbarOverflow>
                <ViewMenu view={view} />
                <WordCountSection editor={editor} />
            </ToolbarOverflow>
        );
    }

    return (
        <ToolbarOverflow>
            <InsertMenu editor={editor} view={view} />
            <ViewMenu view={view} />
            <StyleSection editor={editor} />
            <FormattingSection editor={editor} />
            <ListSection editor={editor} />
            <ColorSection editor={editor} />
            <AlignmentSection editor={editor} />
            <WordCountSection editor={editor} />
        </ToolbarOverflow>
    );
}