// import modules
import ToolbarOverflow from './toolbar/ToolbarOverflow';
import HistorySection from './toolbar/HistorySection';
import StyleSection from './toolbar/StyleSection';
import FormattingSection from './toolbar/FormattingSection';
import ListSection from './toolbar/ListSection';
import AlignmentSection from './toolbar/AlignmentSection';
import ColorLinkSection from './toolbar/ColorLinkSection';
import WordCountSection from './toolbar/WordCountSection';

// component functions
export default function TipTapToolbar({ editor }) {
    if (!editor) return null;

    return (
        <ToolbarOverflow>
            <HistorySection editor={editor} />
            <StyleSection editor={editor} />
            <FormattingSection editor={editor} />
            <ListSection editor={editor} />
            <ColorLinkSection editor={editor} />
            <AlignmentSection editor={editor} />
            <WordCountSection editor={editor} />
        </ToolbarOverflow>
    );
}
