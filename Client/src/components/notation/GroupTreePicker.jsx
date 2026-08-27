// import modules
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';

// configuration constants
const INDENT_STEP = 14;
const ROOT_KEY = 'root';

// utility functions
export function buildGroupTree(groups) {
    const byParent = new Map();

    for (const group of groups) {
        const key = group.parentID ?? ROOT_KEY;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(group);
    }

    for (const list of byParent.values()) {
        list.sort((a, b) => a.groupOrder - b.groupOrder || a.id.localeCompare(b.id));
    }

    function branch(parentKey, depth) {
        return (byParent.get(parentKey) ?? []).flatMap(group => [
            { group, depth, hasChildren: byParent.has(group.id) },
            ...branch(group.id, depth + 1)
        ]);
    }

    return branch(ROOT_KEY, 0);
}

export function ancestorsOf(groups, groupID) {
    const byID = new Map(groups.map(group => [group.id, group]));
    const chain = [];

    let cursor = groupID ? byID.get(groupID) : null;

    while (cursor) {
        chain.unshift(cursor);
        cursor = cursor.parentID ? byID.get(cursor.parentID) : null;
    }

    return chain;
}

// component functions
export default function GroupTreePicker({ groups, value, onChange, disabledID = null }) {
    // state variables
    const [collapsed, setCollapsed] = useState(() => new Set());

    // derived variables
    const rows = useMemo(() => buildGroupTree(groups), [groups]);

    const blocked = useMemo(() => {
        if (!disabledID) return new Set();

        const byParent = new Map();

        for (const group of groups) {
            const key = group.parentID ?? ROOT_KEY;
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(group.id);
        }

        const marked = new Set([disabledID]);
        const queue = [disabledID];

        while (queue.length > 0) {
            for (const child of byParent.get(queue.shift()) ?? []) {
                marked.add(child);
                queue.push(child);
            }
        }

        return marked;
    }, [groups, disabledID]);

    const hidden = useMemo(() => {
        const marked = new Set();

        for (const { group } of rows) {
            const chain = ancestorsOf(groups, group.parentID);
            if (chain.some(ancestor => collapsed.has(ancestor.id)) || collapsed.has(group.parentID)) {
                marked.add(group.id);
            }
        }

        return marked;
    }, [rows, groups, collapsed]);

    // event handlers
    function toggle(groupID) {
        setCollapsed(previous => {
            const next = new Set(previous);

            if (next.has(groupID)) next.delete(groupID);
            else next.add(groupID);

            return next;
        });
    }

    return (
        <div className="notation-tree">
            <button
                type="button"
                className={`notation-tree-row ${value === null ? 'selected' : ''}`}
                onClick={() => onChange(null)}
            >
                <span className="notation-tree-spacer" />
                <FileText size={13} strokeWidth={2} />
                <span className="notation-tree-name">No group</span>
            </button>

            {rows.map(({ group, depth, hasChildren }) => {
                if (hidden.has(group.id)) return null;

                const unavailable = blocked.has(group.id);

                return (
                    <div
                        className="notation-tree-line"
                        key={group.id}
                        style={{ paddingLeft: depth * INDENT_STEP }}
                    >
                        {hasChildren ? (
                            <button
                                type="button"
                                className="notation-tree-toggle"
                                aria-label={collapsed.has(group.id) ? 'Expand' : 'Collapse'}
                                onClick={() => toggle(group.id)}
                            >
                                {collapsed.has(group.id)
                                    ? <ChevronRight size={12} strokeWidth={2.5} />
                                    : <ChevronDown size={12} strokeWidth={2.5} />}
                            </button>
                        ) : (
                            <span className="notation-tree-spacer" />
                        )}

                        <button
                            type="button"
                            className={`notation-tree-row ${value === group.id ? 'selected' : ''} ${unavailable ? 'is-blocked' : ''}`}
                            disabled={unavailable}
                            title={unavailable ? 'A group cannot be moved inside itself' : group.name}
                            onClick={() => onChange(group.id)}
                        >
                            <Folder size={13} strokeWidth={2} style={{ color: group.color ?? 'var(--muted)' }} />
                            <span className="notation-tree-name">{group.name}</span>
                        </button>
                    </div>
                );
            })}

            {rows.length === 0 && (
                <p className="notation-tree-empty">No groups yet</p>
            )}
        </div>
    );
}
