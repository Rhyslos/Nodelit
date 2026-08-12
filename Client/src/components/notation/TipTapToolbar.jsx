// import modules
import WordCountSection from './toolbar/WordCountSection';
import HistorySection from './toolbar/HistorySection';
import StyleSection from './toolbar/StyleSection';
import FormattingSection from './toolbar/FormattingSection';
import ListSection from './toolbar/ListSection';
import AlignmentSection from './toolbar/AlignmentSection';
import ColorLinkSection from './toolbar/ColorLinkSection';

// component functions
export default function TipTapToolbar({ editor }) {
    if (!editor) return null;

    return (
        <div className="tiptap-toolbar">
            <WordCountSection editor={editor} />
            <HistorySection editor={editor} />
            <StyleSection editor={editor} />
            <FormattingSection editor={editor} />
            <ListSection editor={editor} />
            <AlignmentSection editor={editor} />
            <ColorLinkSection editor={editor} />
        </div>
    );
}
