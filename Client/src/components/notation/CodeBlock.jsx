// import modules
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { lowlight } from './CodeHighlight';
import CodeBlockView from './CodeBlockView';

// configuration constants
const INDENT_SPACES = '    ';

// extension definition
export const CodeBlock = CodeBlockLowlight
    .extend({
        addNodeView() {
            return ReactNodeViewRenderer(CodeBlockView);
        },

        addKeyboardShortcuts() {
            return {
                ...this.parent?.(),
                Tab: () => {
                    if (!this.editor.isActive('codeBlock')) return false;
                    return this.editor.commands.insertContent(INDENT_SPACES);
                }
            };
        }
    })
    .configure({ lowlight, defaultLanguage: 'csharp' });
