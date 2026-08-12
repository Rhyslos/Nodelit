// import modules
import { useEditorState } from '@tiptap/react';
import { FONTS, FONT_WEIGHTS } from '../Constants';

// utility functions
function activeBlock(instance) {
    if (instance.isActive('heading', { level: 1 })) return 'h1';
    if (instance.isActive('heading', { level: 2 })) return 'h2';
    if (instance.isActive('heading', { level: 3 })) return 'h3';
    return 'p';
}

function textStyleAttributes(instance) {
    const attributes = instance.getAttributes('textStyle');

    if (instance.state.selection.empty && instance.state.storedMarks) {
        const mark = instance.state.storedMarks.find(entry => entry.type.name === 'textStyle');
        if (mark) return { ...attributes, ...mark.attrs };
    }

    return attributes;
}

function matchFont(value) {
    const base = (value ?? '')
        .replace(/^['"]|['"]$/g, '')
        .split(',')[0]
        .trim()
        .toLowerCase();

    const found = FONTS.find(font => font.value.split(',')[0].trim().toLowerCase() === base);
    return found?.value ?? FONTS[0].value;
}

function matchWeight(value) {
    if (value === 'bold') return '700';
    if (value === 'normal') return '400';
    return (value ?? '400').toString();
}

// event functions
function applyBlock(editor, value) {
    const chain = editor.chain().focus();

    if (value === 'p') chain.setParagraph().run();
    else chain.setHeading({ level: Number(value.slice(1)) }).run();
}

// component functions
export default function StyleSection({ editor }) {
    const state = useEditorState({
        editor,
        selector: ({ editor: instance }) => {
            const attributes = textStyleAttributes(instance);

            return {
                block: activeBlock(instance),
                font: matchFont(attributes.fontFamily),
                weight: matchWeight(attributes.fontWeight)
            };
        }
    });

    return (
        <div className="subbar-section">
            <select
                className="tiptap-select"
                value={state.block}
                onChange={event => applyBlock(editor, event.target.value)}
            >
                <option value="p">Paragraph</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
            </select>

            <select
                className="tiptap-select"
                value={state.font}
                style={{ fontFamily: state.font }}
                onChange={event => editor.chain().focus().setFontFamily(event.target.value).run()}
            >
                {FONTS.map(font => (
                    <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                    </option>
                ))}
            </select>

            <select
                className="tiptap-select"
                value={state.weight}
                onChange={event => editor.chain().focus().setFontWeight(event.target.value).run()}
            >
                {FONT_WEIGHTS.map(weight => (
                    <option key={weight.value} value={weight.value}>{weight.label}</option>
                ))}
            </select>
        </div>
    );
}
