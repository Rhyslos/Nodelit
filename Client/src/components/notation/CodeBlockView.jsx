// import modules
import { useState } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { CODE_LANGUAGES } from './CodeHighlight';

// utility functions
function lineNumbers(text) {
    const total = text.split('\n').length;
    return Array.from({ length: total }, (unused, index) => index + 1);
}

// component functions
export default function CodeBlockView({ node, updateAttributes, editor }) {
    const [copied, setCopied] = useState(false);

    const language = CODE_LANGUAGES.some(entry => entry.value === node.attrs.language)
        ? node.attrs.language
        : CODE_LANGUAGES[0].value;

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(node.textContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    }

    return (
        <NodeViewWrapper className="notation-code-block">
            <div className="notation-code-header" contentEditable={false}>
                <select
                    className="notation-code-language"
                    value={language}
                    disabled={!editor.isEditable}
                    onChange={event => updateAttributes({ language: event.target.value })}
                >
                    {CODE_LANGUAGES.map(entry => (
                        <option key={entry.value} value={entry.value}>{entry.label}</option>
                    ))}
                </select>

                <button className="notation-code-copy" onClick={copyCode}>
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>

            <div className="notation-code-body">
                <div className="notation-code-gutter" contentEditable={false}>
                    {lineNumbers(node.textContent).map(line => (
                        <span key={line}>{line}</span>
                    ))}
                </div>

                <pre className="notation-code-pre">
                    <NodeViewContent as="code" className={`language-${language}`} />
                </pre>
            </div>
        </NodeViewWrapper>
    );
}
