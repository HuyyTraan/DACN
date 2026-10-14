# Hướng dẫn làm việc với Omni Studio

Lượt `scheduled` vẫn `queued` sau giờ hẹn 2 phút tự `cancelled`; worker không claim lượt quá hạn. Kế hoạch chỉ chuyển `cancelled` nếu toàn bộ lượt của phiên bản hiện tại đều hủy; kế hoạch lặp có lượt tương lai giữ `scheduled`. Không tự hủy `running`/`published`/`unknown`/`failed`. Lịch workspace cũ `Đã lên lịch` quá hạn và chưa có kết quả đăng cũng hủy. Sweep 30 giây, đọc/lưu và khởi động; giữ lý do, audit/history. Kế hoạch hủy hoàn toàn chỉ gửi lại `pending` với giờ tương lai.

Lịch gộp bài Page thật (published_posts, since/until theo kỳ xem, phân trang cursor) với workspace/plans, loại trùng bằng provider post ID và dùng createdTime theo múi giờ. Bài nền tảng mở preview đọc, sửa/xóa tại tab Bài trên nền tảng. Không ghi bài đồng bộ vào workspace hoặc giả hàng đợi.

Publishing approval: migration 007 thêm `pending`. Gửi duyệt lưu kế hoạch server không tạo deliveries; Admin/Manager duyệt thành `scheduled`. `pending` quá giờ tự `cancelled` (sweep 30s, đọc/lưu, khởi động), lưu lý do và lịch sử; độc lập worker. Bài đã hủy chỉ gửi lại thành pending với giờ tương lai. FE hiển thị bộ lọc/nhãn và danh sách hủy ở mọi ngày đã tải. Bài đã duyệt có sẵn giữ nguyên.

Migration 008 thêm delivery.plan_version và unique theo phiên bản. Sửa/gửi lại đánh dấu lượt cũ cancelled, giữ nguyên delivery/history; worker chỉ claim phiên bản lịch hiện tại, không dùng lượt cũ để chặn bài của phiên bản mới.

`npm run db:dev-accounts` tạo bốn tài khoản test công khai (admin/manager/editor/viewer) được ghi trong README, chỉ cho PostgreSQL localhost và không ở NODE_ENV=production. Không chạy tự động hoặc ghi đè user đã tồn tại; vô hiệu hóa/đổi mật khẩu test trước khi chia sẻ triển khai.

Áp dụng cho toàn bộ repository. Ưu tiên yêu cầu người dùng và mã/cấu hình thực tế; cập nhật file này khi stack, cấu trúc hoặc lệnh thay đổi.

## Công nghệ và phạm vi

- Frontend React 19 + Vite 8, JavaScript/JSX, CSS token, Lucide React. Backend Node.js/Express 5 giữ CommonJS.
- PostgreSQL 17+ (máy hiện tại 18), pg + Prisma 6.19.3. Bảng quan hệ cho toàn bộ nhóm UI, snapshot/audit/history. Một workspace chung, nhiều người dùng theo vai trò; chưa đa tenant.
- n8n self-hosted qua Docker Compose cho email duyệt bài/lịch chạy RPA; Playwright cho Dashboard screenshot/CSV, Robot Framework/SeleniumLibrary còn là mẫu cũ.
- Swagger UI/OpenAPI 3, collection Postman và Node test runner.
- Dùng Node.js 22.12+ theo Vite; máy kiểm tra dùng 22.20.0 và npm 11.13.0. Đồng bộ manifest và lockfile bằng npm.
- UI gồm dashboard, lịch, chat và đầy đủ 13 mục trong hình yêu cầu, thêm Workflow/RPA: tổng 17 màn hình (thêm Liên kết tài khoản).
- Facebook Page có tích hợp thật; analytics, chat, SERP và các adapter mạng xã hội khác chưa được tích hợp. Không giả vờ OAuth/đồng bộ/tự đăng đã hoạt động. Đăng nhập yêu cầu PostgreSQL. localStorage cũ chỉ được nhập vào DB khi người dùng chọn nhập; không tự chuyển nguồn hay xóa dữ liệu.

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
- BE/compose.yaml, BE/db/init.sql: PostgreSQL/n8n local; BE/compose.n8n-host.yaml: chỉ n8n khi PostgreSQL trên host đã chiếm cổng 5432. BE/workflows/: workflow n8n không active. BE/server/automation.js, rpa-worker.js và BE/rpa/output/: RPA Playwright, output gitignored; BE/rpa/ còn có Robot mẫu.
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
| Worker RPA (chỉ sau cấu hình)      | npm run worker:rpa (cần RPA_EMAIL/RPA_PASSWORD và Chrome)                              |

npm run check không kiểm tra JSX; dùng build. Chưa có script lint/typecheck hoặc CI. Test HTTP dùng port ngẫu nhiên và có thể cần quyền loopback ngoài sandbox. `npm run test:database` đã chạy với PostgreSQL thật trong schema tạm. Playwright on-demand và worker lịch đã chạy thử trên UI cục bộ; n8n workflow/SMTP chưa được import, kích hoạt hoặc gửi thư thật.

Sau thay đổi frontend chạy build và kiểm tra trình duyệt desktop/mobile: sidebar, dialog, bảng/lịch cuộn, overflow, loading/empty/error. Sau sửa logic/persistence/API chạy test liên quan. Kiểm tra diff và báo rõ kiểm tra đạt, chưa chạy hoặc bị chặn.

## Quy ước frontend

- Dùng component/hook/context sẵn có, controlled form và immutable state. Không thêm Next.js/TypeScript/design system khác ngoài yêu cầu.
- Dashboard sáng, gọn, chuyên nghiệp; tím tiết chế cùng mint/coral/beige. Tái sử dụng CSS token/components.
- Giữ tên trường API và thông báo tiếng Việt; không đổi hợp đồng theo ví dụ của skill.
- Dùng semantic control, label, focus-visible, native dialog/Escape/focus return, responsive và reduced motion.
- Không dùng dangerouslySetInnerHTML với input. Ảnh upload chỉ JPG/PNG/WebP/GIF, tối đa 1 MB; không nhận SVG từ người dùng.
- Lọc bài viết phải tính cả channels, không chỉ platform chính. CSV phải quote và chống formula injection.
- Lỗi load/save phải rõ ràng; không âm thầm xóa dữ liệu hỏng. PostgreSQL 409 yêu cầu tải lại, không tự ghi đè phiên khác.
- Lịch workspace cục bộ chưa tự đăng; kế hoạch PostgreSQL dùng worker riêng opt-in. Hiển thị rõ trạng thái storage/worker, không coi workerEnabled là heartbeat.

## Backend và tích hợp

- Bind mặc định 127.0.0.1; PORT/HOST đọc từ BE/.env. Có authentication cookie/session PostgreSQL, CSRF và vai trò admin/manager/editor/viewer; vẫn bind loopback, chưa đa tenant.
- DATABASE_URL trống: GET /api/workspace trả demo, UI lưu local. Có cấu hình: khởi tạo bảng/workspace rỗng nếu cần, lưu snapshot + version. Không hardcode credential thật.
- Thêm field/collection phải cập nhật seed/schema, form, OpenAPI và test đồng bộ. Không sửa integrity lockfile thủ công.
- POST /api/publish/facebook: noiDungBaiViet string; rỗng/sai kiểu 400, thiếu Page/token 503, provider error 502, token lỗi 401, thiếu quyền 403, thành công 200 với facebookPostId. Axios timeout 15 giây. GRAPH_API_VERSION mặc định v21.0 giữ từ mã gốc; chỉ đổi sau khi kiểm tra tương thích.
- Không đưa token/connection string/lỗi provider nhạy cảm vào response/log; không commit .env.
- Test Facebook mock Axios và credential giả; không đăng thật. UI đăng thật qua nút riêng + xác nhận; văn bản và ảnh tùy chọn lên Page đã chọn; không tự đăng khi test.
- Workflow n8n mẫu không active, không có node publish. Không bật workflow/gọi dịch vụ ngoài để kiểm tra UI. Robot chỉ mở/đọc UI.
- Migration 009–010 thêm email outbox, RPA run và loại địa chỉ `.test`; không sửa migration đã áp dụng. Workflow email cần PostgreSQL credential trỏ database ứng dụng và SMTP credential do người dùng cấu hình; không bật hoặc gửi email thật để test khi chưa có credential. Worker RPA riêng đọc UI/CSV và không đăng Facebook. Admin email trên DB cục bộ hiện tại được đổi thành `khaipham111005@gmail.com`, script seed vẫn dùng email `.test` cho môi trường dev mới.
- Không xóa PostgreSQL volume để sửa khởi động. BE/db/init.sql chỉ chạy khi volume khởi tạo lần đầu.

## Skill và định dạng

- ecc:frontend-design-direction cho hướng thiết kế, ecc:frontend-patterns cho React/state/form.
- ecc:backend-patterns và ecc:api-design cho Express/HTTP; ecc:security-review cho input/token/tích hợp.
- ecc:ecc-guide kiểm tra plugin từ file thật. Chỉ dùng skill được cung cấp trong phiên, đọc SKILL.md trước khi áp dụng.
- Không cài plugin/bật hook/chép toàn bộ cấu hình ECC vào repo vì chúng có trong cache.

Prettier dùng 4 khoảng trắng, nháy đơn và dấu chấm phẩy theo .prettierrc.json. Chạy npm run format khi sửa source. Cập nhật README khi đổi cách chạy, API, cấu hình hoặc giới hạn.

Không tự nạp seed() vào runtime UI hoặc PostgreSQL mới. Dùng emptyWorkspace() và withoutDemo() để loại mẫu nguyên bản, giữ dữ liệu người dùng/bài Facebook thật. Không tự ghi đè snapshot DB khi tải. seed() chỉ dùng cho test và nhận diện mẫu cũ. Không thêm lại nút khôi phục demo hoặc ảnh giả trong trình soạn.

## Tích hợp mạng xã hội

- BE/server/social.js: metadata Page qua /me (đối chiếu PAGE_ID), OAuth state/cookie/phiên, token vault AES-256-GCM, đọc published_posts có cursor, sửa/xóa bài thuộc Page và publish /feed hoặc /photos. Không log nguyên lỗi Axios/provider vì có credential.
- FE/src/Social.jsx: liên kết, Page picker và bài Facebook thật; FE/src/Composer.jsx chỉ chọn account đã xác minh, dùng tên/avatar thật. Accounts/channels không còn giả lập trạng thái kết nối bằng form quản trị.
- FACEBOOK_APP_ID/SECRET, FACEBOOK_REDIRECT_URI, SOCIAL_UI_ORIGIN, SOCIAL_TOKEN_ENCRYPTION_KEY cấu hình riêng trên BE; thiếu cấu hình thì nút OAuth disabled. Token .env vẫn hoạt động độc lập. Không cấp quyền/bật app live thay người dùng.
- BE/.data/ gitignored. Không đổi khóa mã hóa hoặc xóa vault để sửa lỗi; giữ token ngoài FE/localStorage/workspace.
- Đăng ảnh: data URL JPG/PNG/WebP/GIF ≤1 MB, xác minh magic bytes trước khi gửi multipart. Không nhận URL ảnh tùy ý để tránh SSRF.
- Worker dùng delivery DB; API đăng ngay dùng studio_publish_requests bền vững (UUID/fingerprint); adapter nội bộ vẫn có cache in-memory 24h. Không tự retry publish khi timeout/kết quả không rõ; đọc Page để tránh trùng.
- Chỉ Facebook có adapter đang hoạt động. Không hiển thị nền tảng chưa tích hợp như đã kết nối; reply/comment/video/reels/insights chưa có adapter thật. Worker có thể đăng các bài độc lập nối tiếp theo lịch PostgreSQL khi người dùng chủ động bật và chạy.
- Social API đọc Page không phụ thuộc workspace DB. Lỗi tải workspace phải hiển thị và chặn lưu cho tới khi người dùng chọn local hoặc DB hoạt động, không ghi đè local cũ bằng dữ liệu rỗng.
- Test OAuth/upload/sửa/xóa dùng mock, không tác động Page thật trừ yêu cầu trực tiếp của người dùng cho bài/thao tác cụ thể.

## Publishing studio

- FE/src/PublishingCalendar.jsx: lịch ngày/tuần/tháng theo giờ, tài khoản thật, đọc kế hoạch server và bản soạn workspace, hủy queued có xác nhận.
- FE/src/publishing-model.mjs: chuyển GMT+7/GMT+8/UTC, form ↔ API kế hoạch. Chỉ zone cố định, không DST.
- BE/server/publishing.js: validation/service/repository/router; SQL parameterized, transaction, version, matrix account × item × occurrence. API được bảo vệ auth/RBAC; chỉ dùng loopback.
- BE/server/publishing-worker.js: tiến trình riêng; chỉ chạy khi DATABASE_URL và PUBLISHING_WORKER_ENABLED=true. Không bật worker để test UI/API.
- BE/db/migrations/001-publishing.sql: migration additive/idempotent; npm run db:migrate tạo hai bảng, không reset volume/snapshot. npm run worker:publishing có thể đăng thật; không tự chạy để kiểm tra.
- FOR UPDATE OF p,d SKIP LOCKED phối hợp claim với sửa/hủy. running bị gián đoạn thành unknown, không tự retry. Đừng báo exactly-once với provider.
- Reply chỉ soạn draft; scheduled reply trả 422. Lặp hữu hạn tối đa 30, 20 account, 10 item. Đăng ngay chỉ bài chính, xác nhận danh sách Page và lưu kết quả từng target.
- PUBLISHING-ARCHITECTURE.md là bản thảo ADR theo skill, chờ duyệt trước khi chuyển docs/adr/. Giữ README/OpenAPI/Postman/tests đồng bộ khi đổi hợp đồng.

## Database và tài khoản (cập nhật)

- Đọc DATABASE-ARCHITECTURE.md cho schema/quan hệ/API. BE/server/auth.js, data-store.js, resources.js; FE/src/Auth.jsx, Administration.jsx, DatabaseAnalytics.jsx.
- Migration 002–006 và data backfill là cộng thêm; studio_migrations có checksum/advisory lock. Không sửa migration đã áp dụng. Không reset/db push/migrate dev trên database người dùng.
- BE/prisma/schema.prisma introspect từ SQL; query read dùng Prisma select, worker/transaction giữ pg. Giữ override deepmerge-ts >=8; validate/generate sau cập nhật dependency.
- npm run db:backup, db:introspect, db:generate, db:validate; npm run test:database tạo schema tạm riêng, không tạo user thử trong workspace thật và không gọi Meta thật.
- Default API bắt đăng nhập. First admin do người dùng tạo trên UI, không hardcode/tự tạo credential thật. Scrypt, hashed sessions, HttpOnly cookie, CSRF. Không lưu credential trong resource/workspace/audit.
- Viewer không ghi. Editor không publish/schedule/kết nối, chỉ sửa draft/gửi duyệt. Admin quản lý user/restore; giữ ít nhất một admin.
- GET workspace đọc bảng quan hệ; PUT version transaction lưu snapshot cũ + audit + projection. Không gọi withoutDemo trên dữ liệu DB. Dữ liệu cũ import theo id với xác nhận, không overwrite record DB.
- Không bật publishing worker để kiểm thử auth/database. Authentication:false chỉ dependency injection test, production entry point luôn bật.
