// component functions
export default function Subbar({ children, className = '' }) {
    return (
        <div className={`subbar ${className}`}>
            {children}
        </div>
    );
}