// package imports
import { useState, useMemo } from 'react';

// style configurations
const COLORS = {
    created: '#3b82f6',
    completed: '#10b981'
};

// component functions
export default function StatLines({ labels, lines }) {
    // state variables
    const [hovered, setHovered] = useState(null);

    // data transformations
    const { max, points } = useMemo(() => {
        const maxVal = Math.max(...lines.flatMap(l => l.values), 1);
        const mappedPoints = labels.map((label, i) => {
            const point = { label, x: i / Math.max(labels.length - 1, 1) };
            lines.forEach(line => {
                point[line.key] = line.values[i] || 0;
            });
            return point;
        });
        return { max: maxVal, points: mappedPoints };
    }, [labels, lines]);

    // calculation functions
    const buildSmoothPath = (dataKey) => {
        if (points.length === 0) return '';
        
        let path = `M 0 ${100 - (points[0][dataKey] / max) * 100}`;
        
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i+1];
            
            const x0 = p0.x * 100;
            const y0 = 100 - (p0[dataKey] / max) * 100;
            const x1 = p1.x * 100;
            const y1 = 100 - (p1[dataKey] / max) * 100;
            
            const cx = (x0 + x1) / 2;
            path += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
        }
        
        return path;
    };

    // render conditions
    if (!labels || labels.length === 0) {
        return <p className="stat-empty">No history available</p>;
    }

    // layout structure
    return (
        <div style={{ position: 'relative', width: '100%', height: '260px', paddingBottom: '24px' }}>
            
            {/* grid layout */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '24px', zIndex: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ borderTop: '1px dashed #f3f4f6', width: '100%' }}></div>
                ))}
            </div>

            {/* svg containers */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 'calc(100% - 24px)', overflow: 'visible' }} preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                    <linearGradient id="createdArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.created} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={COLORS.created} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="completedArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.completed} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={COLORS.completed} stopOpacity={0}/>
                    </linearGradient>
                </defs>

                {/* data loops */}
                {lines.map((line) => {
                    const linePath = buildSmoothPath(line.key);
                    const areaPath = `${linePath} L 100 100 L 0 100 Z`;
                    
                    return (
                        <g key={line.key}>
                            <path d={areaPath} fill={`url(#${line.key}Area)`} vectorEffect="non-scaling-stroke" />
                            <path d={linePath} fill="none" stroke={COLORS[line.key]} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                        </g>
                    );
                })}
            </svg>

            {/* overlay components */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', zIndex: 10 }}>
                {points.map((pt, i) => {
                    const isHovered = hovered === i;
                    
                    return (
                        <div 
                            key={i} 
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                            style={{ flex: 1, height: '100%', position: 'relative', cursor: 'crosshair' }}
                        >
                            {/* visual elements */}
                            {isHovered && (
                                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: '24px', width: '1px', background: '#94a3b8', transform: 'translateX(-50%)', pointerEvents: 'none' }}></div>
                            )}
                            
                            {/* popup layouts */}
                            {isHovered && (
                                <div style={{ position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #f3f4f6', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textAlign: 'center' }}>{pt.label}</div>
                                    {lines.map(line => (
                                        <div key={line.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13px', fontWeight: 'bold' }}>
                                            <span style={{ color: COLORS[line.key] }}>{line.label}:</span>
                                            <span>{pt[line.key]}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* typography elements */}
                            <span style={{ position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                {pt.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}