// component functions
export default function ColorPicker({ colors, onSelect, style = {} }) {
    return (
        <div className="tiptap-color-picker" style={style}>
            {colors.map(color => (
                <button
                    key={color}
                    className="tiptap-color-swatch"
                    style={{
                        backgroundColor: color,
                        border: color === '#FFFFFF' ? '1px solid var(--border)' : 'none'
                    }}
                    onClick={() => onSelect(color)}
                />
            ))}
        </div>
    );
}
