// component imports
import Subbar from './Subbar';
import TipTapToolbar from '../notation/TipTapToolbar';

// configuration constants
const STATUS_LABELS = {
    loading: 'Opening…',
    syncing: 'Syncing…',
    synced: 'Saved',
    offline: 'Reconnecting…'
};

// component functions
export default function NotationSubbar({ editor, status, canEdit, view }) {
    return (
        <Subbar className="subbar--notation">
            <TipTapToolbar editor={editor} view={view} />

            <div className="notation-save-indicator">
                {view.reading ? 'Reading' : canEdit ? STATUS_LABELS[status] ?? '' : 'Read only'}
            </div>
        </Subbar>
    );
}
