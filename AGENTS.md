# Hướng dẫn làm việc với Omni Studio

Áp dụng cho toàn bộ repository. Ưu tiên yêu cầu người dùng và mã/cấu hình thực tế; cập nhật file này khi stack, cấu trúc hoặc lệnh thay đổi.

## Công nghệ và phạm vi

- Frontend React 19 + Vite 8, JavaScript/JSX, CSS token, Lucide React. Backend Node.js/Express 5 giữ CommonJS.
- PostgreSQL 17 qua pg; snapshot JSONB với optimistic version control. Một workspace prototype, chưa có schema quan hệ nghiệp vụ/đa tenant.
- n8n self-hosted qua Docker Compose; Robot Framework/SeleniumLibrary cho RPA mẫu.
- Swagger UI/OpenAPI 3, collection Postman và Node test runner.
- Dùng Node.js 22.12+ theo Vite; máy kiểm tra dùng 22.20.0 và npm 11.13.0. Đồng bộ manifest và lockfile bằng npm.
- UI gồm dashboard, lịch, chat và đầy đủ 13 mục trong hình yêu cầu, thêm Workflow/RPA: tổng 16 màn hình.
- Analytics, kết nối kênh, chat, SERP là demo. Không giả vờ OAuth/đồng bộ/tự đăng đã hoạt động. Không có DATABASE_URL thì lưu localStorage; có cấu hình thì lưu PostgreSQL.

## Cấu trúc

- FE/src/App.jsx: shell/sidebar, hash navigation, Workspace context, load/save và dialog quản trị.
- FE/src/components.jsx: bảng, metric, modal, badge, avatar, biểu đồ SVG và CSV; tái sử dụng trước khi thêm thư viện/component.
- FE/src/pages.jsx: quản trị, phân tích, lịch, inbox, SEO và workflow.
- FE/src/Composer.jsx: nhiều kênh, preview, ảnh/bình luận, nháp/duyệt/lịch và Facebook có xác nhận.
- FE/src/styles.css: token, responsive và reduced motion. FE/public/brand.svg: logo.
- FE/public/domain.js: seed/helper/schema chung cho browser và Node. Script load trước React, export CommonJS cho server/test.
- BE/server.js: Express, static FE/dist, API Facebook, Swagger và download mẫu. Đọc BE/.env theo __dirname.
- BE/server/workspace.js: router/repository PostgreSQL, SQL parameterized, version check atomically.
- BE/api/: OpenAPI/Postman. BE/test/: test HTTP/repository; FE/test/: test domain.
- BE/compose.yaml, BE/db/init.sql: PostgreSQL/n8n local. BE/workflows/: workflow n8n không active. BE/rpa/: Robot mẫu.
- BE/.env.example: cấu hình mẫu; BE/.env, node_modules, FE/dist, cache/output không commit.
- package.json/package-lock.json, .prettierrc.json và tài liệu hướng dẫn dùng chung ở gốc. Mọi lệnh npm chạy tại gốc; chưa tách thành npm workspaces.
- FE/public/domain.js được backend dùng lại cho seed/schema; cập nhật cùng UI/API/test, không nhân đôi helper.
- DOCX, sơ đồ kiến trúc và ảnh tham khảo là tài liệu người dùng; giữ nguyên nếu không được yêu cầu sửa.

## Lệnh thực tế

Chạy tại gốc bằng PowerShell:

Ưu tiên hướng dẫn phát triển bằng hai terminal riêng: BE `npm run dev:api` ở 3000, FE `npm run dev` ở 5173 (hoặc cổng Vite in thực tế). `npm start` chỉ là chế độ Express phục vụ API và bản build FE/dist chung một tiến trình. Không chạy start và dev:api cùng cổng. Khi chẩn đoán API, kiểm tra health trực tiếp BE, health qua Vite proxy rồi workspace/response Network; health không kiểm tra kết nối PostgreSQL. README có bảng xử lý lỗi chi tiết.

| Mục đích                           | Lệnh                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Cài lockfile                       | npm ci                                                                                 |
| Build React                        | npm run build                                                                          |
| UI production + API localhost:3000 | npm start (build trước)                                                                |
| Dev API                            | npm run dev:api                                                                        |
| React/HMR                          | npm run dev (terminal riêng; proxy API về 3000)                                        |
| Kiểm tra cú pháp backend/domain    | npm run check                                                                          |
| Test tự động                       | npm test                                                                               |
| Kiểm tra format                    | npm run format:check                                                                   |
| Chuẩn hóa format                   | npm run format                                                                         |
| PostgreSQL + n8n                   | docker compose --env-file BE/.env -f BE/compose.yaml up -d (cần Docker Engine và .env) |

npm run check không kiểm tra JSX; dùng build. Chưa có script lint/typecheck hoặc CI. Test HTTP dùng port ngẫu nhiên và có thể cần quyền loopback ngoài sandbox. Test PostgreSQL dùng mock; không báo integration thật đạt nếu chưa chạy DB. Docker Engine chưa chạy trong lần kiểm tra ban đầu. Robot/n8n mẫu chưa được thực thi.

Sau thay đổi frontend chạy build và kiểm tra trình duyệt desktop/mobile: sidebar, dialog, bảng/lịch cuộn, overflow, loading/empty/error. Sau sửa logic/persistence/API chạy test liên quan. Kiểm tra diff và báo rõ kiểm tra đạt, chưa chạy hoặc bị chặn.

## Quy ước frontend

- Dùng component/hook/context sẵn có, controlled form và immutable state. Không thêm Next.js/TypeScript/design system khác ngoài yêu cầu.
- Dashboard sáng, gọn, chuyên nghiệp; tím tiết chế cùng mint/coral/beige. Tái sử dụng CSS token/components.
- Giữ tên trường API và thông báo tiếng Việt; không đổi hợp đồng theo ví dụ của skill.
- Dùng semantic control, label, focus-visible, native dialog/Escape/focus return, responsive và reduced motion.
- Không dùng dangerouslySetInnerHTML với input. Ảnh upload chỉ JPG/PNG/WebP/GIF, tối đa 1 MB; không nhận SVG từ người dùng.
- Lọc bài viết phải tính cả channels, không chỉ platform chính. CSV phải quote và chống formula injection.
- Lỗi load/save phải rõ ràng; không âm thầm xóa dữ liệu hỏng. PostgreSQL 409 yêu cầu tải lại, không tự ghi đè phiên khác.
- Lịch/lặp lại chỉ cấu hình demo cho đến khi có worker; giữ nhãn minh bạch trong UI.

## Backend và tích hợp

- Bind mặc định 127.0.0.1; PORT/HOST đọc từ BE/.env. Chưa có authentication/phân quyền, không triển khai public như hệ thống nhiều người dùng.
- DATABASE_URL trống: GET /api/workspace trả demo, UI lưu local. Có cấu hình: khởi tạo bảng/seed nếu cần, lưu snapshot + version. Không hardcode credential thật.
- Thêm field/collection phải cập nhật seed/schema, form, OpenAPI và test đồng bộ. Không sửa integrity lockfile thủ công.
- POST /api/publish/facebook: noiDungBaiViet string; rỗng/sai kiểu 400, thiếu Page/token 503, provider error 500, thành công 200 với facebookPostId. Axios timeout 15 giây. Graph v21.0 giữ từ mã gốc, chưa xác minh tình trạng hỗ trợ hiện tại.
- Không đưa token/connection string/lỗi provider nhạy cảm vào response/log; không commit .env.
- Test Facebook mock Axios và credential giả; không đăng thật. UI đăng thật qua nút riêng + xác nhận; chỉ text lên Page cấu hình trên server.
- Workflow n8n mẫu không active, không có node publish. Không bật workflow/gọi dịch vụ ngoài để kiểm tra UI. Robot chỉ mở/đọc UI.
- Không xóa PostgreSQL volume để sửa khởi động. BE/db/init.sql chỉ chạy khi volume khởi tạo lần đầu.

## Skill và định dạng

- ecc:frontend-design-direction cho hướng thiết kế, ecc:frontend-patterns cho React/state/form.
- ecc:backend-patterns và ecc:api-design cho Express/HTTP; ecc:security-review cho input/token/tích hợp.
- ecc:ecc-guide kiểm tra plugin từ file thật. Chỉ dùng skill được cung cấp trong phiên, đọc SKILL.md trước khi áp dụng.
- Không cài plugin/bật hook/chép toàn bộ cấu hình ECC vào repo vì chúng có trong cache.

Prettier dùng 4 khoảng trắng, nháy đơn và dấu chấm phẩy theo .prettierrc.json. Chạy npm run format khi sửa source. Cập nhật README khi đổi cách chạy, API, cấu hình hoặc giới hạn.
