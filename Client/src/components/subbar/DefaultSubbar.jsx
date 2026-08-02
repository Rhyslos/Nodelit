// component imports
import { useState } from 'react';
import Subbar from './Subbar';

// configuration constants
const SECTIONS = [
    { label: 'Recent', placeholder: 'No recent workspaces' },
    { label: 'Deadlines', placeholder: 'No upcoming deadlines' },
    { label: 'Activity', placeholder: 'No recent activity' }
];

// component functions
export default function DefaultSubbar() {
    // state variables
    const [collapsed, setCollapsed] = useState(false);

    return (
        <Subbar>
            {SECTIONS.map(section => (
                <div className="subbar-section" key={section.label}>
                    <span className="subbar-label">{section.label}</span>
                    <div className="subbar-placeholder">{section.placeholder}</div>
                </div>
            ))}

            <button className="subbar-collapse-btn" onClick={() => setCollapsed(open => !open)}>
                {collapsed ? '▲ Hide' : '☰ Overview'}
            </button>

            {collapsed && (
                <div className="subbar-collapsed-dropdown">
                    {SECTIONS.map(section => (
                        <div className="subbar-collapsed-section" key={section.label}>
                            <span className="subbar-label">{section.label}</span>
                            <div className="subbar-placeholder">{section.placeholder}</div>
                        </div>
                    ))}
                </div>
            )}
        </Subbar>
    );
}
