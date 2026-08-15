// import modules
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color, FontFamily } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import { CodeBlock } from './CodeBlock';
import { FontWeight } from './FontWeight';
import { FontSize } from './FontSize';
import { Indent } from './Indent';
import { LinkBehaviour } from './LinkBehaviour';
import { StickyFloats } from './StickyFloats';

// extension configuration
export const editorExtensions = [
    StarterKit.configure({
        undoRedo: false,
        codeBlock: false,
        link: {
            openOnClick: false,
            autolink: true,
            protocols: ['http', 'https', 'mailto'],
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' }
        }
    }),
    CodeBlock,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    FontFamily,
    FontWeight,
    FontSize,
    Indent,
    LinkBehaviour,
    StickyFloats,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true, lastColumnResizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: 'Start typing your notes…' }),
    CharacterCount
];
