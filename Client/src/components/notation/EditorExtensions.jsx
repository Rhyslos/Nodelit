// import modules
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color, FontFamily } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import { FontWeight } from './FontWeight';

// extension configuration
export const editorExtensions = [
    StarterKit.configure({
        undoRedo: false,
        link: { openOnClick: false, autolink: true }
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    FontFamily,
    FontWeight,
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start typing your notes…' }),
    CharacterCount
];
