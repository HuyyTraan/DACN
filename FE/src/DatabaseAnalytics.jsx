import React, { useEffect, useState } from 'react';
import { useWorkspace } from './App.jsx';
import { authRequest } from './Auth.jsx';
import { Panel, Metric, DataTable, Empty, Button, compact, money } from './components.jsx';
import { Eye, Wallet, MousePointer2, Users } from 'lucide-react';
function useRecords() {
    const [state, setState] = useState({ loading: true, metrics: [], traffic: [], error: '' });
    useEffect(() => {
        let live = true;
        Promise.all([
            authRequest('/api/records/metrics?limit=1000'),
            authRequest('/api/records/traffic?limit=1000')
        ])
            .then(([m, t]) => {
                if (live)
                    setState({ loading: false, metrics: m.items, traffic: t.items, error: '' });
            })
            .catch((e) => {
                if (live) setState((s) => ({ ...s, loading: false, error: e.message }));
            });
        return () => {
            live = false;
        };
    }, []);
    return state;
}
export function StoredTrend() {
    const state = useRecords();
    const { platform, period, navigate } = useWorkspace();
    if (state.loading) return <p role="status">Đang tải số liệu…</p>;
    if (state.error) return <p role="alert">{state.error}</p>;
    const cutoff = Date.now() - (period === 'week' ? 7 : 30) * 86400000;
    const rows = state.metrics
        .filter((r) => (!platform || r.platform === platform) && Date.parse(r.measuredAt) >= cutoff)
        .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
    if (!rows.length)
        return (
            <Empty
                title="Chưa có số liệu được ghi nhận"
                action={<Button onClick={() => navigate('data')}>Ghi nhận số liệu</Button>}
            />
        );
    const max = Math.max(1, ...rows.map((r) => r.reach || 0));
    const points = rows
        .map(
            (r, i) =>
                `${30 + (i * 640) / Math.max(1, rows.length - 1)},${230 - ((r.reach || 0) * 200) / max}`
        )
        .join(' ');
    return (
        <div className="chart-wrap">
            <svg
                viewBox="0 0 720 280"
                role="img"
                aria-label="Lượt tiếp cận từ số liệu đã lưu trong PostgreSQL"
            >
                <line x1="30" x2="690" y1="230" y2="230" stroke="#ddd" />
                <polyline points={points} stroke="#8874e6" strokeWidth="3" fill="none" />
                {rows.map((r, i) => (
                    <circle
                        key={r.id}
                        cx={30 + (i * 640) / Math.max(1, rows.length - 1)}
                        cy={230 - ((r.reach || 0) * 200) / max}
                        r="4"
                        fill="#8874e6"
                    >
                        <title>
                            {r.name}: {r.reach || 0}
                        </title>
                    </circle>
                ))}
            </svg>
            <p className="hint">
                {rows.length} lần ghi nhận trong {period === 'week' ? 7 : 30} ngày; chưa tự đồng bộ
                từ nền tảng.
            </p>
        </div>
    );
}
export default function DatabaseAnalytics({ kind }) {
    const state = useRecords();
    const { data, platform, navigate } = useWorkspace();
    const m = state.metrics.filter((r) => !platform || r.platform === platform);
    const rows = kind === 'traffic' ? state.traffic : kind === 'competitors' ? data.competitors : m;
    const sum = (field) => m.reduce((a, b) => a + (Number(b[field]) || 0), 0);
    return (
        <>
            <div className="info-note">
                Số liệu đã lưu trong PostgreSQL. Chưa tự thu thập chỉ số từ nhà cung cấp.
            </div>
            <div className="metrics">
                <Metric label="Tiếp cận được ghi nhận" value={compact(sum('reach'))} icon={Eye} />
                <Metric label="Lượt nhấp" value={compact(sum('clicks'))} icon={MousePointer2} />
                <Metric label="Chi phí được ghi nhận" value={money(sum('spend'))} icon={Wallet} />
                <Metric label="Sự kiện traffic" value={state.traffic.length} icon={Users} />
            </div>
            <Panel
                title="Số liệu theo thời gian"
                action={<Button onClick={() => navigate('data')}>Quản lý số liệu</Button>}
            >
                <StoredTrend />
            </Panel>
            {state.loading ? (
                <p role="status">Đang tải báo cáo…</p>
            ) : state.error ? (
                <p className="form-error" role="alert">
                    {state.error}
                </p>
            ) : (
                <DataTable
                    rows={rows}
                    title={
                        kind === 'traffic'
                            ? 'Lịch sử traffic'
                            : kind === 'competitors'
                              ? 'Đối thủ đã lưu'
                              : 'Số liệu kênh & bài viết'
                    }
                    columns={
                        kind === 'competitors'
                            ? [
                                  { key: 'name', label: 'Đối thủ' },
                                  { key: 'url', label: 'Tên miền' },
                                  { key: 'traffic', label: 'Traffic' },
                                  { key: 'score', label: 'Điểm' }
                              ]
                            : [
                                  { key: 'name', label: 'Tên' },
                                  { key: 'platform', label: 'Nền tảng' },
                                  {
                                      key: kind === 'traffic' ? 'occurredAt' : 'measuredAt',
                                      label: 'Thời điểm'
                                  },
                                  {
                                      key: kind === 'traffic' ? 'visits' : 'reach',
                                      label: kind === 'traffic' ? 'Lượt truy cập' : 'Tiếp cận'
                                  },
                                  { key: 'clicks', label: 'Lượt nhấp' }
                              ]
                    }
                />
            )}
        </>
    );
}
