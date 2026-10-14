const express = require('express');
const { Pool } = require('pg');
const { emptyWorkspace, validWorkspace } = require('../../FE/public/domain');
const { readRecords, writeRecords } = require('./data-store');

function validateWorkspace(data) {
    return validWorkspace(data);
}

class PostgresWorkspace {
    constructor(pool) {
        this.pool = pool;
        this.ready = null;
    }
    async init() {
        if (!this.ready)
            this.ready = (async () => {
                await this.pool.query(
                    'CREATE TABLE IF NOT EXISTS omni_workspace (id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
                );
                await this.pool.query(
                    'INSERT INTO omni_workspace (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
                    [JSON.stringify(emptyWorkspace())]
                );
            })().catch((error) => {
                this.ready = null;
                throw error;
            });
        await this.ready;
    }
    async read(actor) {
        if (actor) await require('./approval-expiry').expireWorkspace(this.pool);
        if (!actor) await this.init();
        const result = await this.pool.query(
            'SELECT data, version FROM omni_workspace WHERE id = 1'
        );
        if (actor) return { version: result.rows[0].version, data: await readRecords(this.pool) };
        return result.rows[0];
    }
    async write(data, version, actor) {
        if (actor) return writeRecords(this.pool, data, version, actor);
        await this.init();
        const result = await this.pool.query(
            'UPDATE omni_workspace SET data = $1::jsonb, version = version + 1, updated_at = NOW() WHERE id = 1 AND version = $2 RETURNING version',
            [JSON.stringify(data), version]
        );
        return result.rows[0];
    }
}

function workspaceRouter(store) {
    const router = express.Router();
    const repository =
        store ||
        (process.env.DATABASE_URL
            ? new PostgresWorkspace(
                  new Pool({
                      connectionString: process.env.DATABASE_URL,
                      connectionTimeoutMillis: 3000,
                      query_timeout: 5000,
                      max: 5
                  })
              )
            : null);
    router.get('/', async (req, res) => {
        if (!repository) return res.json({ mode: 'demo', data: null, version: 0 });
        try {
            res.json({ mode: 'postgres', ...(await repository.read(req.actor)) });
        } catch {
            res.status(503).json({
                error: 'Không thể kết nối PostgreSQL. Kiểm tra DATABASE_URL và trạng thái cơ sở dữ liệu.'
            });
        }
    });
    router.put('/', async (req, res) => {
        if (req.actor?.role === 'viewer')
            return res.status(403).json({ error: 'Vai trò chỉ xem không được thay đổi dữ liệu.' });
        if (!repository)
            return res.status(503).json({
                error: 'Chưa cấu hình PostgreSQL. Chế độ demo lưu dữ liệu trên trình duyệt.'
            });
        const { data, version } = req.body || {};
        if (!validateWorkspace(data) || !Number.isInteger(version) || version < 1)
            return res
                .status(400)
                .json({ error: 'Dữ liệu không gian hoặc phiên bản không hợp lệ.' });
        try {
            const result = await repository.write(data, version, req.actor);
            if (!result)
                return res.status(409).json({
                    error: 'Dữ liệu đã thay đổi ở phiên khác. Tải lại trang trước khi lưu.'
                });
            res.json(result);
        } catch (e) {
            res.status(e.status || 503).json({
                error: e.status ? e.message : 'Không thể lưu dữ liệu vào PostgreSQL.'
            });
        }
    });
    return router;
}
module.exports = { validateWorkspace, PostgresWorkspace, workspaceRouter };
