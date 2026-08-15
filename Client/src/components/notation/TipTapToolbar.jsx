// import modules
import ToolbarOverflow from './toolbar/ToolbarOverflow';
import HistorySection from './toolbar/HistorySection';
import StyleSection from './toolbar/StyleSection';
import FormattingSection from './toolbar/FormattingSection';
import ListSection from './toolbar/ListSection';
import ColorSection from './toolbar/ColorSection';
import InsertMenu from './toolbar/InsertMenu';
import ViewMenu from './toolbar/ViewMenu';
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
            <HistorySection editor={editor} />
            <StyleSection editor={editor} />
            <FormattingSection editor={editor} />
            <ListSection editor={editor} />
            <ColorSection editor={editor} />
            <InsertMenu editor={editor} />
            <ViewMenu view={view} />
            <AlignmentSection editor={editor} />
            <WordCountSection editor={editor} />
        </ToolbarOverflow>
    );
}
