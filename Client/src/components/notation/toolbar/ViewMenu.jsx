// import modules
import ToolbarMenu, { ToolbarMenuItem } from './ToolbarMenu';

// component functions
export default function ViewMenu({ view }) {
    return (
        <div className="subbar-section">
            <ToolbarMenu label="View" title="View">
                <ToolbarMenuItem onSelect={() => view.onReading(false)} disabled={!view.reading}>
                    Editing mode
                </ToolbarMenuItem>

                <ToolbarMenuItem onSelect={() => view.onReading(true)} disabled={view.reading}>
                    Reading mode
                </ToolbarMenuItem>
            </ToolbarMenu>
        </div>
    );
}
