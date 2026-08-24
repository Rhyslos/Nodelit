// component imports
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';

// configuration constants
const MENU_MARGIN = 8;
const MENU_WIDTH = 240;

// component functions
export default function TabVisibilityMenu({
    anchorRect,
    tabs,
    tabGroups = [],
    hidden,
    onToggleTab,
    onToggleGroup,
    onShowAll,
    onClose
}) {
    // dom references
    const ref = useRef(null);

    // state variables
    const [pos, setPos] = useState({ top: 0, left: 0 });

    // layout functions
    useLayoutEffect(() => {
        if (!anchorRect) return;

        const height = ref.current ? ref.current.getBoundingClientRect().height : 0;

        let left = anchorRect.right - MENU_WIDTH;
        let top = anchorRect.bottom + 6;

        if (left < MENU_MARGIN) left = MENU_MARGIN;

        if (top + height + MENU_MARGIN > window.innerHeight) {
            top = Math.max(MENU_MARGIN, anchorRect.top - height - 6);
        }

        setPos({ top, left });
    }, [anchorRect]);

    // lifecycle functions
    useEffect(() => {
        function handlePointerDown(e) {
            if (ref.current && ref.current.contains(e.target)) return;
            onClose();
        }

        function handleKey(e) {
            if (e.key === 'Escape') onClose();
        }

        const frame = requestAnimationFrame(() => {
            document.addEventListener('mousedown', handlePointerDown);
            document.addEventListener('keydown', handleKey);
            window.addEventListener('scroll', onClose, true);
            window.addEventListener('resize', onClose);
        });

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    // derived variables
    const sections = [];

    for (const group of tabGroups) {
        const members = tabs.filter(tab => tab.groupID === group.id);
        if (members.length > 0) sections.push({ group, tabs: members });
    }

    const loose = tabs.filter(tab => !tab.groupID);
    if (loose.length > 0) sections.push({ group: null, tabs: loose });

    const visibleCount = tabs.filter(tab => !hidden.has(tab.id)).length;

    // render functions
    function renderRow(tab) {
        const isHidden = hidden.has(tab.id);

        return (
            <button
                key={tab.id}
                type="button"
                className={`tab-visibility-row ${isHidden ? 'is-hidden' : ''}`}
                onClick={() => onToggleTab(tab.id)}
            >
                <span className="tab-visibility-eye">
                    {isHidden
                        ? <EyeOff size={13} strokeWidth={2} />
                        : <Eye size={13} strokeWidth={2} />}
                </span>

                <span className="tab-visibility-dot" style={{ background: tab.color }} />
                <span className="tab-visibility-name">{tab.name}</span>
            </button>
        );
    }

    return createPortal(
        <div
            ref={ref}
            className="tab-visibility-menu"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="tab-visibility-head">
                <span className="tab-visibility-title">Visible tabs</span>
                <span className="tab-visibility-count">{visibleCount} of {tabs.length}</span>
            </div>

            <div className="tab-visibility-list">
                {sections.map(section => (
                    <div className="tab-visibility-section" key={section.group?.id ?? 'ungrouped'}>
                        {section.group ? (
                            <button
                                type="button"
                                className="tab-visibility-group"
                                onClick={() => onToggleGroup(section.group.id)}
                                title="Toggle the whole group"
                            >
                                <span className="tab-visibility-eye">
                                    {section.tabs.every(tab => hidden.has(tab.id))
                                        ? <EyeOff size={13} strokeWidth={2} />
                                        : <Eye size={13} strokeWidth={2} />}
                                </span>

                                <span
                                    className="tab-visibility-dot"
                                    style={{ background: section.group.color }}
                                />
                                <span className="tab-visibility-name">{section.group.name}</span>
                            </button>
                        ) : (
                            <span className="tab-visibility-label">Ungrouped</span>
                        )}

                        {section.tabs.map(renderRow)}
                    </div>
                ))}
            </div>

            <div className="tab-visibility-foot">
                <button type="button" className="tab-visibility-action" onClick={onShowAll}>
                    Show all
                </button>
            </div>
        </div>,
        document.body
    );
}
