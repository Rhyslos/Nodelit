// package imports
import { useState } from 'react';

// component functions
export default function StatBars({ series, emptyLabel }) {
    // state variables
    const [hovered, setHovered] = useState(null);

    // render conditions
    if (!series || series.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    // calculation functions
    const max = Math.max(...series.map(s => s.value), 1);
    const uniformGradient = 'linear-gradient(to bottom, #818cf8 5%, #4f46e5 95%)';

    // layout structure
    return (
        <div style={{ position: 'relative', width: '100%', height: '220px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', paddingBottom: '24px' }}>
            
            {/* grid layout */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '24px', zIndex: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {[...Array(4)].map((_, i) => (
                    <div key={i} style={{ borderTop: '1px dashed #f3f4f6', width: '100%' }}></div>
                ))}
            </div>

            {/* data loops */}
            {series.map((entry, index) => {
                const heightPercentage = (entry.value / max) * 100;
                const isHovered = hovered === index;

                return (
                    <div 
                        key={entry.key}
                        onMouseEnter={() => setHovered(index)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', zIndex: 1, cursor: 'pointer' }}
                    >
                        {/* overlay components */}
                        {isHovered && (
                            <div style={{ position: 'absolute', top: '-30px', background: '#fff', border: '1px solid #f3f4f6', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 10 }}>
                                {entry.value}
                            </div>
                        )}
                        
                        {/* visual elements */}
                        <div style={{ 
                            width: '80%', 
                            height: `${heightPercentage}%`, 
                            background: uniformGradient, 
                            borderTopLeftRadius: '6px', 
                            borderTopRightRadius: '6px', 
                            opacity: isHovered ? 1 : 0.85,
                            transition: 'opacity 0.2s, height 0.3s ease'
                        }}></div>
                        
                        {/* typography elements */}
                        <span style={{ position: 'absolute', bottom: '-24px', fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                            {entry.label}
                        </span>
                    </div>
                )
            })}
        </div>
    );
}