// package imports
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, Tooltip, CartesianGrid } from 'recharts';

// component functions
export default function StatBars({ series, emptyLabel }) {
    if (!series || series.length === 0) {
        return <p className="stat-empty">{emptyLabel}</p>;
    }

    return (
        <div style={{ width: '100%', height: '220px' }}>
            <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    
                    {/* svg definitions */}
                    <defs>
                        <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.9}/>
                            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.9}/>
                        </linearGradient>
                        <linearGradient id="soonGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.9}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.9}/>
                        </linearGradient>
                        <linearGradient id="overdueGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.9}/>
                            <stop offset="95%" stopColor="#c084fc" stopOpacity={0.9}/>
                        </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    
                    <XAxis 
                        dataKey="label" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9ca3af', fontSize: 12 }} 
                        dy={10} 
                    />
                    
                    <Tooltip 
                        cursor={{ fill: 'rgba(0,0,0,0.02)' }} 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} 
                    />
                    
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {series.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`url(#${entry.tone}Grad)`} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}