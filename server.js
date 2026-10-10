require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/api/publish/facebook', async (req, res) => {
    const { noiDungBaiViet } = req.body;

    if (!noiDungBaiViet) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu nội dung bài viết'
        });
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.PAGE_ID}/feed`,
            null,
            {
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
        const details = error.response?.data || error.message;
        console.error('Lỗi từ Facebook:', details);

        res.status(500).json({
            success: false,
            error: 'Không thể đăng bài lên Facebook'
        });
    }
});

app.listen(3000, () => {
    console.log('Hệ thống Backend đang chạy ở port 3000');
});
