import React, { useEffect, useState } from 'react';
export function apiFetch(url, options = {}) {
    const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('omni_csrf='))
        ?.split('=')[1];
    return fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { ...options.headers, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
    });
}
export async function authRequest(path, options = {}) {
    const r = await apiFetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || 'Yêu cầu thất bại.');
    return b;
}
export default function AuthGate({ children }) {
    const [session, setSession] = useState(null),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ email: '', name: '', password: '' });
    async function load() {
        setLoading(true);
        setError('');
        try {
            setSession(await authRequest('/api/auth/session'));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        load();
    }, []);
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await authRequest(
                '/api/auth/' + (session?.bootstrapRequired ? 'bootstrap' : 'login'),
                { method: 'POST', body: JSON.stringify(form) }
            );
            setForm({ email: '', name: '', password: '' });
            setSession(result);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }
    async function logout() {
        try {
            await authRequest('/api/auth/logout', { method: 'POST' });
            setSession({ user: null, bootstrapRequired: false });
        } catch (e) {
            setError(e.message);
        }
    }
    if (session?.user) return children(session.user, logout);
    return (
        <main className="auth-shell">
            <section className="auth-card">
                <img src="/brand.svg" alt="Omni Studio" />
                <h1>
                    {loading
                        ? 'Đang mở không gian…'
                        : session?.bootstrapRequired
                          ? 'Tạo quản trị viên đầu tiên'
                          : 'Đăng nhập Omni Studio'}
                </h1>
                <p>Dữ liệu và lịch sử được lưu trong PostgreSQL.</p>
                {!loading && session && (
                    <form onSubmit={submit}>
                        {session.bootstrapRequired && (
                            <label>
                                Họ tên
                                <input
                                    autoComplete="name"
                                    required
                                    maxLength={100}
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </label>
                        )}
                        <label>
                            Email
                            <input
                                type="email"
                                autoComplete="username"
                                required
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </label>
                        <label>
                            Mật khẩu
                            <input
                                type="password"
                                required
                                autoComplete={
                                    session.bootstrapRequired ? 'new-password' : 'current-password'
                                }
                                minLength={session.bootstrapRequired ? 12 : 1}
                                maxLength={128}
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                        </label>
                        <button className="button primary" disabled={busy}>
                            {busy
                                ? 'Đang xử lý…'
                                : session.bootstrapRequired
                                  ? 'Tạo quản trị viên'
                                  : 'Đăng nhập'}
                        </button>
                    </form>
                )}
                {error && (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                )}
                {!loading && !session && (
                    <button className="button" onClick={load}>
                        Thử kết nối lại
                    </button>
                )}
                <small>Mật khẩu tài khoản ứng dụng độc lập với mật khẩu PostgreSQL.</small>
            </section>
        </main>
    );
}
