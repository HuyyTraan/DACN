import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './Auth.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
    state = { error: false };
    static getDerivedStateFromError() {
        return { error: true };
    }
    render() {
        if (this.state.error)
            return (
                <main className="fatal">
                    <h1>Không thể mở không gian làm việc</h1>
                    <p>Vui lòng tải lại trang. Dữ liệu đã lưu vẫn được giữ lại.</p>
                    <button onClick={() => location.reload()}>Tải lại</button>
                </main>
            );
        return this.props.children;
    }
}
createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <AuthGate>{(user, onLogout) => <App user={user} onLogout={onLogout} />}</AuthGate>
    </ErrorBoundary>
);
