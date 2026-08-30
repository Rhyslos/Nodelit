// package imports
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, CartesianGrid } from 'recharts';

// data formatting functions
function formatChartData(labels, lines) {
    return labels.map((label, i) => {
        const dataPoint = { name: label };
        lines.forEach(line => {
            dataPoint[line.key] = line.values[i] || 0;
        });
        return dataPoint;
    });
}

// component functions
export default function StatLines({ labels, lines }) {
    const data = formatChartData(labels, lines);

    return (
        <div style={{ width: '100%', height: '260px' }}>
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    
                    {/* svg definitions */}
                    <defs>
                        <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
                        </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    
                    <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 12 }} 
                        dy={10} 
                    />
                    
                    <Tooltip 
                        cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '5 5' }} 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} 
                    />
                    
                    <Area 
                        type="monotone" 
                        dataKey="created" 
                        stroke="#f97316" 
                        strokeWidth={3} 
                        fillOpacity={1} 
                        fill="url(#createdGrad)" 
                        activeDot={{ r: 6, strokeWidth: 0 }} 
                    />
                    <Area 
                        type="monotone" 
                        dataKey="completed" 
                        stroke="#2dd4bf" 
                        strokeWidth={3} 
                        fillOpacity={1} 
                        fill="url(#completedGrad)" 
                        activeDot={{ r: 6, strokeWidth: 0 }} 
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}