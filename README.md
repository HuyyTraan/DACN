# Facebook Publisher API

API Node.js/Express dùng để đăng bài lên Facebook Page.

## Cài đặt

```bash
npm install
```

Tạo file `.env`:

```env
PAGE_ID=your_page_id
PAGE_ACCESS_TOKEN=your_page_access_token
```

## Chạy ứng dụng

```bash
node server.js
```

Server chạy tại `http://localhost:3000`.

## Đăng bài

Gửi POST request đến:

```text
/api/publish/facebook
```

Body JSON:

```json
{
  "noiDungBaiViet": "Nội dung bài viết"
}
```
