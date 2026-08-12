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
export default function NotationSubbar({ editor, status, canEdit }) {
    return (
        <Subbar className="subbar--notation">
            <TipTapToolbar editor={canEdit ? editor : null} />

            <div className="notation-save-indicator">
                {canEdit ? STATUS_LABELS[status] ?? '' : 'Read only'}
            </div>
        </Subbar>
    );
}
