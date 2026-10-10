# Omni Studio

Prototype quản trị tiếp thị đa kênh cho đồ án Intelligent Automation. UI React gồm 16 màn hình, dữ liệu minh họa và lưu dữ liệu quản trị bằng PostgreSQL hoặc localStorage.

## Techstack

- Frontend: React 19, Vite 8, Lucide React, CSS token và biểu đồ SVG.
- Backend: Node.js / Express 5, Axios, dotenv.
- Database: PostgreSQL 17, driver pg, snapshot JSONB có kiểm soát phiên bản.
- Workflow: n8n self-hosted qua Docker Compose, workflow duyệt nội dung mẫu.
- RPA: Robot Framework + SeleniumLibrary, kịch bản smoke test mẫu.
- API: Swagger UI / OpenAPI 3, collection Postman.

Dùng Node.js 22.12+ theo toolchain Vite; máy kiểm tra dùng 22.20.0. Dependency được ghim trong package-lock.json.

## Cấu trúc source

```text
BE/
  server.js             Express entry point
  server/               Workspace API và PostgreSQL repository
  api/                  OpenAPI và collection Postman
  db/                   SQL khởi tạo
  workflows/            Workflow n8n
  rpa/                  Kịch bản Robot Framework
  test/                 Test HTTP và repository
  compose.yaml          PostgreSQL và n8n
  .env.example          Cấu hình backend mẫu
FE/
  src/                  React, component và CSS
  public/               Logo và domain helper
  test/                 Test domain helper
  index.html            HTML entry point
  vite.config.mjs       Vite/HMR và API proxy
  dist/                 Build output (không commit)
package.json            Lệnh chạy và dependency dùng chung
package-lock.json       Lockfile npm dùng chung
```

Chạy các lệnh npm tại gốc dự án. Backend dùng chung seed/validation từ `FE/public/domain.js` để giữ dữ liệu UI và API đồng bộ; không sao chép helper sang hai nơi. Tài liệu và ảnh tham khảo của đồ án giữ ở gốc.

## Phát triển: chạy BE và FE ở hai terminal

Chạy `npm ci` một lần tại gốc dự án. Sao chép `BE/.env.example` thành `BE/.env` nếu cần cấu hình backend; Express đọc file này độc lập với thư mục chạy lệnh. Không cần database để xem demo, không commit token.

Terminal 1 — backend Express, mặc định cổng 3000:

```powershell
npm run dev:api
```

Terminal 2 — frontend React/Vite, mặc định cổng 5173:

```powershell
npm run dev
```

Cả hai terminal đều chạy tại gốc dự án. Mở URL Vite in trong terminal FE (mặc định **http://127.0.0.1:5173**). FE gửi `/api/...` qua proxy Vite tới BE ở `http://127.0.0.1:3000`. Khi BE dừng hoặc lỗi, dev server FE vẫn phục vụ giao diện; thao tác cần API sẽ lỗi. Xem log BE ở terminal 1 và lỗi build/proxy FE ở terminal 2.

Không chạy thêm `npm start` cùng lúc với `npm run dev:api` trên cổng 3000. Nếu đổi PORT của BE trong `BE/.env`, cập nhật proxy tại `FE/vite.config.mjs` và khởi động lại Vite. Nếu 5173 đang bận, Vite có thể chọn cổng khác; dùng URL thực tế trong terminal. localStorage tách theo origin, nên dữ liệu demo trên 5173 và 3000 được lưu riêng.

## Kiểm tra khi backend hoặc API không kết nối

Mở một terminal kiểm tra riêng, giữ hai dev server đang chạy:

```powershell
# Gọi trực tiếp backend
Invoke-RestMethod http://127.0.0.1:3000/api/health
# Gọi qua proxy frontend (đổi 5173 nếu Vite dùng cổng khác)
Invoke-RestMethod http://127.0.0.1:5173/api/health
# Kiểm tra đọc dữ liệu workspace, bao gồm kết nối DB nếu đã cấu hình
Invoke-RestMethod http://127.0.0.1:3000/api/workspace
```

Health bình thường trả `status: ok`, `storage: demo` hoặc `postgres`. Health chỉ xác nhận Express hoạt động; `storage: postgres` chỉ phản ánh cấu hình, chưa chứng minh DB kết nối được.

| Kết quả                             | Kiểm tra tiếp                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Gọi trực tiếp 3000 không được       | Xem terminal BE: lỗi khởi động, thiếu dependency, `EADDRINUSE` (cổng đã bị chiếm); kiểm tra HOST/PORT trong `BE/.env`. |
| Gọi 3000 được, qua 5173 không được  | Kiểm tra URL/cổng Vite, proxy trong `FE/vite.config.mjs` và lỗi `ECONNREFUSED` ở terminal FE.                          |
| Health được nhưng workspace trả 503 | Kiểm tra DATABASE_URL, PostgreSQL đang chạy và credential; API workspace không truy cập được database.                 |
| Workspace trả `mode: demo`          | BE hoạt động nhưng chưa cấu hình DATABASE_URL; dữ liệu quản trị lưu localStorage.                                      |
| PUT workspace trả 409               | Phiên bản dữ liệu đã thay đổi; tải lại workspace trước khi lưu tiếp.                                                   |
| Một API trả 400/404/500/503         | Xem response JSON và hợp đồng Swagger; mã lỗi phụ thuộc endpoint, không đồng nghĩa BE đã dừng.                         |

Trong trình duyệt, mở F12 → Network → Fetch/XHR rồi thực hiện lại thao tác lỗi. Kiểm tra URL, status, response và payload của request; xem Console nếu lỗi JavaScript. Dùng Swagger tại **http://127.0.0.1:3000/api/docs** hoặc collection Postman trong `BE/api/` để gọi API trực tiếp và tách lỗi API khỏi lỗi UI/proxy.

## Chạy bản build: một terminal

```powershell
npm ci
npm run build
npm start
```

Mở **http://localhost:3000**. Server mặc định bind 127.0.0.1 và phục vụ build trong `FE/dist`. Không cần database để xem demo: dữ liệu quản trị lưu trên trình duyệt. Sao chép `BE/.env.example` thành `BE/.env` nếu cần cấu hình; không commit token. Express đọc `BE/.env` độc lập với thư mục chạy lệnh.

Chế độ này dùng một tiến trình Express cho cả API và file tĩnh React đã build, phù hợp xem bản build. Không có HMR; sửa frontend cần build lại. Nếu tiến trình BE dừng, cả giao diện và API trên cổng 3000 đều ngừng phục vụ. Khi phát triển/debug, dùng hai terminal như hướng dẫn phía trên.

## Màn hình

| Màn hình                | Thao tác prototype                                            |
| ----------------------- | ------------------------------------------------------------- |
| Tổng quan               | KPI, biểu đồ, ngân sách, mở chiến dịch/bài sắp đăng           |
| Lịch nội dung           | Tuần/tháng, chuyển kỳ, lọc kênh/trạng thái, tạo bài từ ô ngày |
| Hộp thư đa kênh         | Tìm/lọc, xem khách hàng, lưu phản hồi demo, đánh dấu xử lý    |
| Cài đặt tài khoản       | Thêm/sửa/xóa bản ghi quản trị                                 |
| Quản lý kênh            | Bảng/thẻ, thêm/sửa/xóa kênh demo                              |
| Hiệu suất & ngân sách   | Chọn kỳ/kênh, biểu đồ, ngân sách chiến dịch, CSV              |
| Thống kê traffic kênh   | Chọn kỳ/kênh, nguồn truy cập, bảng/CSV                        |
| Quản lý chiến dịch      | Thêm/sửa/xóa, lọc trạng thái, ngân sách và tiến độ            |
| Quản lý bài viết        | Nhiều kênh, preview, ảnh, bình luận, nháp/duyệt/lịch          |
| Traffic khách hàng      | Khách hàng, nguồn, truy cập, phân loại lead                   |
| Quản lý quảng cáo       | Bản ghi quảng cáo, ngân sách, CTR và lượt nhấp demo           |
| Thông tin kênh bài viết | Tiếp cận, tương tác, chi tiết bài đã đăng                     |
| Thứ hạng từ khóa Omni   | Theo dõi từ khóa và tăng/giảm hạng demo                       |
| gCompare                | So sánh đối thủ, traffic và điểm hiển thị demo                |
| gCheck                  | Form, loading, kết quả mô phỏng và lịch sử                    |
| Workflow & RPA          | Mở n8n, tải kịch bản Robot, thông tin tích hợp                |

Bảng hỗ trợ tìm kiếm, lọc kênh, sort, phân trang và CSV. Có xác nhận xóa, loading/empty/error, modal native hỗ trợ Escape/focus, mobile sidebar thu gọn và inbox một cột. Bảng/lịch cuộn trong vùng riêng khi hẹp.

## PostgreSQL và n8n

Cần Docker Desktop chạy Linux containers. Tạo `BE/.env` từ mẫu, thay N8N_ENCRYPTION_KEY bằng chuỗi ngẫu nhiên dài và cấu hình mật khẩu local. Chạy tại gốc:

```powershell
docker compose --env-file BE/.env -f BE/compose.yaml up -d
```

PostgreSQL ở localhost:5432, user omni, database omni. Với mật khẩu mẫu dành cho local:

```env
DATABASE_URL=postgresql://omni:omni_local_dev@localhost:5432/omni
```

Khởi động lại Express. UI báo nguồn lưu PostgreSQL. GET /api/workspace khởi tạo seed khi DB trống; PUT lưu snapshot JSONB và tăng version. Phiên bản cũ trả 409, yêu cầu tải lại để tránh ghi đè. Đây là mô hình một workspace prototype, chưa phải schema quan hệ/đa tenant hoàn chỉnh.

n8n ở http://localhost:5678. Hoàn tất thiết lập local và import BE/workflows/content-review.n8n.json. Workflow không active; Manual Trigger chỉ chuẩn bị bản ghi chờ con người duyệt. Chưa có worker tích hợp UI hoặc tự đăng. BE/db/init.sql tạo database n8n riêng khi volume PostgreSQL khởi tạo lần đầu. Không xóa volume nếu cần giữ dữ liệu.

Compose dùng image n8n latest cho local; ghim tag/digest đã kiểm tra trước khi triển khai ổn định. Docker Engine chưa chạy trên máy kiểm tra, nên PostgreSQL thật và việc chạy/import workflow n8n chưa được xác minh. Test repository/API dùng mock, không thay thế integration test thật.

## Robot Framework

BE/rpa/workspace.robot mở dashboard và kiểm tra màn hình chiến dịch. Cài Python, Chrome và môi trường ảo nếu cần chạy độc lập:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install robotframework robotframework-seleniumlibrary
.\.venv\Scripts\python -m robot --outputdir BE/rpa/output BE/rpa/workspace.robot
```

Cần WebDriver/Selenium Manager hoạt động. Kịch bản mẫu chưa chạy trên máy kiểm tra; các luồng UI được kiểm tra bằng trình duyệt Codex.

## API và Postman

- Swagger: http://localhost:3000/api/docs
- OpenAPI: http://localhost:3000/api/openapi.json
- Postman: BE/api/omni-studio.postman_collection.json hoặc http://localhost:3000/api/postman
- GET /api/health kiểm tra HTTP server, không kiểm tra DB.
- GET /api/workspace trả mode, snapshot và version.
- PUT /api/workspace nhận `{ "data": <workspace>, "version": <phiên bản đã đọc> }`.

Collection Postman chỉ có health, workspace, schema và validation Facebook rỗng; Collection Runner không đăng thật.

API cũ POST /api/publish/facebook nhận:

```json
{ "noiDungBaiViet": "Nội dung đã được duyệt" }
```

Cần PAGE_ID và PAGE_ACCESS_TOKEN trên server. Trong trình soạn bài chọn **Tùy chọn → Đăng Facebook thật**, sau đó xác nhận. Chỉ gửi văn bản ngay lên Page trong .env; không gửi ảnh, bình luận hoặc kênh khác. Thiếu cấu hình trả 503, rỗng/sai kiểu trả 400, lỗi nhà cung cấp/timeout trả 500. Graph API v21.0 giữ từ mã gốc; cần xác minh hỗ trợ và quyền Meta trước khi dùng thật. Không đăng bài thật trong kiểm thử.

## Kiểm tra

```powershell
npm run build
npm run check
npm test
npm run format:check
```

Node test runner kiểm tra schema/persistence, lọc đa kênh, CSV an toàn, validation lịch, HTTP/static/Swagger, Facebook mock, lỗi DB, version conflict và parameterized SQL. Build kiểm tra JSX/bundle. npm run format chuẩn hóa source và tài liệu.

## Giới hạn

UI và lưu dữ liệu quản trị hoạt động. Analytics, OAuth/kết nối kênh, chat và SERP là demo. Lịch/lặp lại chỉ lưu cấu hình, chưa có worker thực thi. Ảnh mẫu preview không được đính kèm nếu chưa upload ảnh riêng. Control định dạng dùng Markdown để preview; API Facebook gửi nguyên văn. Chưa có authentication, phân quyền, nguồn số liệu thật hoặc AI. Server dành cho phát triển local; cần hoàn thiện các phần này trước khi triển khai nhiều người dùng.
