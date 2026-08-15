// import modules
import ToolbarMenu, { ToolbarMenuItem, ToolbarMenuDivider } from './ToolbarMenu';

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

                <ToolbarMenuDivider />

                <ToolbarMenuItem
                    onSelect={() => view.onLayout('pageless')}
                    disabled={!view.canEdit || view.layout === 'pageless'}
                >
                    Pageless
                </ToolbarMenuItem>

                <ToolbarMenuItem
                    onSelect={() => view.onLayout('paged')}
                    disabled={!view.canEdit || view.layout === 'paged'}
                >
                    Paged
                </ToolbarMenuItem>
            </ToolbarMenu>
        </div>
    );
}
