const express = require('express');
const axios = require('axios');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const swaggerUi = require('swagger-ui-express');
const { workspaceRouter } = require('./server/workspace');
const openapi = require('./api/openapi.json');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/workspace', workspaceRouter());
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/api/openapi.json', (req, res) => res.json(openapi));
app.get('/api/postman', (req, res) =>
    res.download(path.join(__dirname, 'api/omni-studio.postman_collection.json'))
);
app.get('/api/rpa-example', (req, res) =>
    res.download(path.join(__dirname, 'rpa/workspace.robot'))
);
app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', storage: process.env.DATABASE_URL ? 'postgres' : 'demo' })
);
app.use(express.static(path.join(__dirname, '../FE/dist')));

app.post('/api/publish/facebook', async (req, res) => {
    const { noiDungBaiViet } = req.body || {};

    if (typeof noiDungBaiViet !== 'string' || !noiDungBaiViet.trim()) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu nội dung bài viết'
        });
    }

    if (!process.env.PAGE_ID || !process.env.PAGE_ACCESS_TOKEN) {
        return res
            .status(503)
            .json({ success: false, error: 'Chưa cấu hình tài khoản Facebook trên máy chủ' });
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.PAGE_ID}/feed`,
            null,
            {
                timeout: 15000,
                params: {
                    message: noiDungBaiViet,
                    access_token: process.env.PAGE_ACCESS_TOKEN
                }
            }
        );

        res.json({
            success: true,
            message: 'Đã đăng lên Fanpage thành công!',
            facebookPostId: response.data.id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Không thể đăng bài lên Facebook'
        });
    }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint không tồn tại' }));
app.use((error, req, res, next) => {
    res.status(error.status === 413 ? 413 : 400).json({
        error: error.status === 413 ? 'Dữ liệu quá lớn (tối đa 5 MB)' : 'Request không hợp lệ'
    });
});

if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, process.env.HOST || '127.0.0.1', () =>
        console.log(`Omni Studio đang chạy tại http://localhost:${port}`)
    );
}

module.exports = app;
