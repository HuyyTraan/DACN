# Hướng dẫn làm việc với Omni Studio

Lượt `scheduled` vẫn `queued` sau giờ hẹn 2 phút tự `cancelled`; worker không claim lượt quá hạn. Kế hoạch chỉ chuyển `cancelled` nếu toàn bộ lượt của phiên bản hiện tại đều hủy; kế hoạch lặp có lượt tương lai giữ `scheduled`. Không tự hủy `running`/`published`/`unknown`/`failed`. Lịch workspace cũ `Đã lên lịch` quá hạn và chưa có kết quả đăng cũng hủy. Sweep 30 giây, đọc/lưu và khởi động; giữ lý do, audit/history. Kế hoạch hủy hoàn toàn chỉ gửi lại `pending` với giờ tương lai.

Lịch gộp bài Page thật (published_posts, since/until theo kỳ xem, phân trang cursor) với workspace/plans, loại trùng bằng provider post ID và dùng createdTime theo múi giờ. Bài nền tảng mở preview đọc, sửa/xóa tại tab Bài trên nền tảng. Không ghi bài đồng bộ vào workspace hoặc giả hàng đợi.

Publishing approval: migration 007 thêm `pending`. Gửi duyệt lưu kế hoạch server không tạo deliveries; Admin/Manager duyệt thành `scheduled`. `pending` quá giờ tự `cancelled` (sweep 30s, đọc/lưu, khởi động), lưu lý do và lịch sử; độc lập worker. Bài đã hủy chỉ gửi lại thành pending với giờ tương lai. FE hiển thị bộ lọc/nhãn và danh sách hủy ở mọi ngày đã tải. Bài đã duyệt có sẵn giữ nguyên.

Migration 011 thêm `rejected` cho kế hoạch bị Admin/Manager từ chối có lý do; không tạo delivery. Editor chỉ gửi lại `pending` sau khi sửa và chọn giờ đủ xa. Bảng duyệt trong FE/src/ApprovalBoard.jsx đọc từ PostgreSQL và lịch sử xử lý, không giả trạng thái duyệt từ workspace.

Migration 013 thêm job RPA `approval_read` theo ID/phiên bản, kết quả JSON và thời điểm đọc. Workflow email n8n tạo job từ outbox rồi chỉ gửi sau khi Playwright đọc UI và kiểm tra lại bài `pending`/người nhận; `sending` không tự retry khi SMTP chưa rõ. Link email mở `#posts/approvals/<id>`. Demo SMTP dùng Mailpit profile `demo-mail`, workflow mặc định chưa active.

Migration 008 thêm delivery.plan_version và unique theo phiên bản. Sửa/gửi lại đánh dấu lượt cũ cancelled, giữ nguyên delivery/history; worker chỉ claim phiên bản lịch hiện tại, không dùng lượt cũ để chặn bài của phiên bản mới.

`npm run db:dev-accounts` tạo bốn tài khoản test công khai (admin/manager/editor/viewer) được ghi trong README, chỉ cho PostgreSQL localhost và không ở NODE_ENV=production. Không chạy tự động hoặc ghi đè user đã tồn tại; vô hiệu hóa/đổi mật khẩu test trước khi chia sẻ triển khai.

Áp dụng cho toàn bộ repository. Ưu tiên yêu cầu người dùng và mã/cấu hình thực tế; cập nhật file này khi stack, cấu trúc hoặc lệnh thay đổi.

## Công nghệ và phạm vi

- Frontend React 19 + Vite 8, JavaScript/JSX, CSS token, Lucide React. Backend Node.js/Express 5 giữ CommonJS.
- PostgreSQL 17+ (máy hiện tại 18), pg + Prisma 6.19.3. Bảng quan hệ cho toàn bộ nhóm UI, snapshot/audit/history. Một workspace chung, nhiều người dùng theo vai trò; chưa đa tenant.
- n8n self-hosted qua Docker Compose cho email duyệt bài/lịch chạy RPA; Playwright cho Dashboard screenshot/CSV, Robot Framework/SeleniumLibrary còn là mẫu cũ.
- Swagger UI/OpenAPI 3, collection Postman và Node test runner.
- Dùng Node.js 22.12+ theo Vite; máy kiểm tra dùng 22.20.0 và npm 11.13.0. Đồng bộ manifest và lockfile bằng npm.
- UI gồm Dashboard, lịch, chat, AI Analysis theo kỳ và các mục quản trị nội dung, thêm Workflow/RPA và Liên kết tài khoản. Dùng sidebar/hash trong `FE/src/App.jsx` làm nguồn chuẩn cho tên và số màn hình hiện tại.
- Facebook Page có tích hợp thật; analytics, chat, SERP và các adapter mạng xã hội khác chưa được tích hợp. Không giả vờ OAuth/đồng bộ/tự đăng đã hoạt động. Đăng nhập yêu cầu PostgreSQL. localStorage cũ chỉ được nhập vào DB khi người dùng chọn nhập; không tự chuyển nguồn hay xóa dữ liệu.

## Hướng dẫn tác nhân và nguồn chuẩn

- Áp dụng file này cho toàn repository. Ưu tiên yêu cầu hiện tại của người dùng, sau đó kiểm chứng hướng dẫn với source, cấu hình, migration và test thực tế; ghi nhận mâu thuẫn thay vì sao chép giả định cũ.
- README.md là hướng dẫn cài/chạy, API và giới hạn sản phẩm; DATABASE-ARCHITECTURE.md là bản đồ schema/quan hệ; PUBLISHING-ARCHITECTURE.md là bản thảo kiến trúc publishing. Không tạo bản sao nội dung dài trong AGENTS.md; cập nhật tài liệu sở hữu thông tin khi thay đổi.
- Trước khi sửa, kiểm tra `git status --short` và bảo toàn thay đổi sẵn có của người dùng. Chỉ sửa file liên quan; không reset database/volume, ghi đè `.env`, token vault hoặc tài liệu người dùng.
- ECC chỉ dùng skill có trong danh sách phiên hiện tại và đọc `SKILL.md` từ cache trước khi áp dụng. Skill chọn theo phạm vi: `ecc:repo-scan`/`ecc:codebase-onboarding` để khảo sát; `ecc:frontend-patterns`/`ecc:frontend-design-direction` cho React/UI; `ecc:backend-patterns`/`ecc:api-design`/`ecc:security-review` cho API, DB và tích hợp; `ecc:database-migrations` cho migration; `ecc:docs-governance` hoặc `ecc:living-docs-governance` cho tài liệu. Skill `repo-scan` tại cache hiện là bootstrap yêu cầu clone/cài skill bên ngoài; không cài hoặc chạy script mạng nếu chưa được yêu cầu. `skill-stocktake` kiểm toán kỹ năng Claude trong `.claude/`, không thay thế việc kiểm kê các skill ECC được phiên cung cấp.
- Định dạng theo `.prettierrc.json`: 4 spaces, single quote, không trailing comma, print width 100. Chạy `npm run format` khi sửa source/tài liệu thuộc script; không format các file đang có chỉnh sửa người dùng ngoài phạm vi nếu không cần.

## Cấu trúc

- FE/src/App.jsx: shell/sidebar, hash navigation, Workspace context, load/save và dialog quản trị.
- FE/src/components.jsx: bảng, metric, modal, badge, avatar, biểu đồ SVG và CSV; tái sử dụng trước khi thêm thư viện/component.
- FE/src/pages.jsx: quản trị, phân tích, lịch, inbox, SEO và workflow.
- FE/src/Composer.jsx: nhiều kênh, preview, ảnh/bình luận, nháp/duyệt/lịch và Facebook có xác nhận.
- FE/src/ApprovalBoard.jsx: bảng duyệt bài, lọc/xuất CSV, duyệt/từ chối và lý do.
- FE/src/AiAnalysis.jsx: nhập số liệu theo kỳ cho Facebook Page, preview dữ liệu gửi AI, KPI/facts, báo cáo và lịch sử.
- FE/src/styles.css: token, responsive và reduced motion. FE/public/brand.svg: logo.
- FE/public/domain.js: seed/helper/schema chung cho browser và Node. Script load trước React, export CommonJS cho server/test.
- BE/server.js: Express, static FE/dist, API Facebook, Swagger và download mẫu. Đọc BE/.env theo __dirname.
- BE/server/workspace.js: router/repository PostgreSQL, SQL parameterized, version check atomically.
- BE/server/ai-analysis.js, ai-metrics.js, ai-provider.js: API phân tích, tính KPI/facts và adapter Gemini ở backend; dữ liệu nhập/lịch sử nằm ở migration 012.
- BE/api/: OpenAPI/Postman. BE/test/: test HTTP/repository; FE/test/: test domain.
- BE/compose.yaml, BE/db/init.sql: PostgreSQL/n8n local; BE/compose.n8n-host.yaml: chỉ n8n khi PostgreSQL trên host đã chiếm cổng 5432. BE/workflows/: workflow n8n không active. BE/server/automation.js, rpa-worker.js và BE/rpa/output/: RPA Playwright, output gitignored; BE/rpa/ còn có Robot mẫu.
- BE/.env.example: cấu hình mẫu; BE/.env, node_modules, FE/dist, cache/output không commit.
- package.json/package-lock.json, .prettierrc.json và tài liệu hướng dẫn dùng chung ở gốc. Mọi lệnh npm chạy tại gốc; chưa tách thành npm workspaces.
- FE/public/domain.js được backend dùng lại cho seed/schema; cập nhật cùng UI/API/test, không nhân đôi helper.
- DOCX, sơ đồ kiến trúc và ảnh tham khảo là tài liệu người dùng; giữ nguyên nếu không được yêu cầu sửa.

### Bản đồ tra cứu nhanh

| Việc cần làm                    | Điểm bắt đầu                                                                                       | Đối chiếu                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| React shell, state, form        | `FE/src/App.jsx`, `FE/src/Composer.jsx`, `FE/src/ApprovalBoard.jsx`                                | `FE/src/components.jsx`, `FE/src/styles.css`, `FE/test/`                   |
| Lịch đăng                       | `FE/src/PublishingCalendar.jsx`, `FE/src/publishing-model.mjs`, `BE/server/publishing.js`          | `BE/server/publishing-worker.js`, migrations 001, 007, 008, 011; README    |
| Đăng nhập/phân quyền và dữ liệu | `BE/server/auth.js`, `BE/server/resources.js`, `BE/server/data-store.js`                           | `BE/db/migrations/`, `BE/prisma/schema.prisma`, `DATABASE-ARCHITECTURE.md` |
| Facebook/Instagram              | `BE/server/social.js`, `BE/server/publish-receipts.js`, `FE/src/Social.jsx`, `FE/src/Composer.jsx` | `BE/test/social.test.cjs`, OpenAPI và README                               |
| Automation/RPA                  | `BE/server/automation.js`, `BE/server/rpa-worker.js`, `BE/workflows/`                              | README và `BE/rpa/`                                                        |
| AI Analysis Page                | `FE/src/AiAnalysis.jsx`, `BE/server/ai-analysis.js`, `BE/server/ai-metrics.js`                     | `BE/server/ai-provider.js`, migration 012, `eval/ai-analysis/`, README     |
| Hợp đồng API                    | `BE/api/openapi.json`                                                                              | `BE/api/omni-studio.postman_collection.json`, `BE/test/`                   |

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
| Kiểm tra schema Prisma             | npm run db:validate                                                                    |
| Sinh Prisma Client                 | npm run db:generate                                                                    |
| Test PostgreSQL trong schema riêng | npm run test:database                                                                  |
| PostgreSQL + n8n                   | docker compose --env-file BE/.env -f BE/compose.yaml up -d (cần Docker Engine và .env) |
| Worker RPA (chỉ sau cấu hình)      | npm run worker:rpa (cần RPA_EMAIL/RPA_PASSWORD và Chrome)                              |

npm run check không kiểm tra JSX; dùng build. Chưa có script lint/typecheck hoặc CI. Test HTTP dùng port ngẫu nhiên và có thể cần quyền loopback ngoài sandbox. `npm run test:database` đã chạy với PostgreSQL thật trong schema tạm. Playwright on-demand và worker lịch đã chạy thử trên UI cục bộ; n8n workflow/SMTP chưa được import, kích hoạt hoặc gửi thư thật.

Sau thay đổi frontend chạy build và kiểm tra trình duyệt desktop/mobile: sidebar, dialog, bảng/lịch cuộn, overflow, loading/empty/error. Sau sửa logic/persistence/API chạy test liên quan. Kiểm tra diff và báo rõ kiểm tra đạt, chưa chạy hoặc bị chặn.

Phân biệt kiểm tra theo script thực tế: `npm run check` chỉ dùng `node --check` cho các file backend/domain được liệt kê, không kiểm tra JSX; `npm run build` kiểm tra compile/bundle frontend; `npm test` chạy Node test runner cho test API, domain, social, publishing và database integration theo môi trường; `npm run test:database` cần PostgreSQL và dùng schema tạm. `npm run format:check` chỉ kiểm tra danh sách path được khai báo trong `package.json`. Không chạy lệnh migration, worker publishing, đăng bài thật, gửi email hoặc thay đổi tài khoản chỉ để kiểm tra.

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
- POST /api/publish/facebook: noiDungBaiViet string; hỗ trợ Facebook và Instagram Professional đã liên kết. Thành công trả providerPostId; Facebook giữ facebookPostId tương thích. Instagram đăng ngay ảnh JPG ≤1 MB qua container/media_publish; local dùng Cloudflare Quick Tunnel tạm nếu cloudflared có sẵn, triển khai dùng kho S3-compatible công khai cấu hình bằng INSTAGRAM_MEDIA_*. Tunnel chỉ mở endpoint ảnh ngẫu nhiên, không dùng sản xuất. Rỗng/sai kiểu 400, thiếu media hosting 503, provider error 502, token lỗi 401, thiếu quyền 403. Không tự retry khi kết quả Instagram chưa rõ. Axios timeout 15 giây. GRAPH_API_VERSION mặc định v21.0 giữ từ mã gốc; chỉ đổi sau khi kiểm tra tương thích.
- Không đưa token/connection string/lỗi provider nhạy cảm vào response/log; không commit .env.
- AI Analysis chỉ nhận số liệu theo kỳ do người dùng nhập cho Facebook Page, tối đa 30 bài. KPI/fact do backend tính; text bài là dữ liệu không tin cậy. Gemini chỉ giải thích fact, không chạy tool hay tự sửa lịch/ngân sách/đăng bài. Không gửi token/cookie/email/khách hàng. Mặc định chỉ cho phép `gemini-2.5-flash-lite` với key project Free Tier chưa liên kết billing; giới hạn lượt/ngày ở backend env. Muốn dùng Paid Tier phải chủ động tắt `AI_GEMINI_FREE_TIER_ONLY` và cấu hình trần ngân sách/đơn giá. Test mock, không gọi provider thật khi chưa được phép. Dữ liệu `eval/ai-analysis/` là tổng hợp, không tự seed vào workspace thật.
- Test Facebook mock Axios và credential giả; không đăng thật. UI đăng thật qua nút riêng + xác nhận; văn bản và ảnh tùy chọn lên Page đã chọn; không tự đăng khi test.
- Workflow n8n mẫu không active, không có node publish. Không bật workflow/gọi dịch vụ ngoài để kiểm tra UI. Robot chỉ mở/đọc UI.
- Migration 009–010 thêm email outbox, RPA run và loại địa chỉ `.test`; migration 013 nối RPA đọc bài duyệt theo phiên bản. Không sửa migration đã áp dụng. Workflow email cần PostgreSQL credential trỏ database ứng dụng và SMTP credential do người dùng cấu hình; không bật hoặc gửi email thật để test khi chưa có credential. Worker RPA riêng đọc UI/CSV và không đăng Facebook. `RPA_BASE_URL` là origin loopback của WebApp, tài khoản RPA nên là Viewer. Email/tài khoản trong database cục bộ có thể thay đổi; kiểm tra database và README hiện tại trước khi hướng dẫn đăng nhập. Script seed cho database dev mới khai báo tài khoản mẫu trong `BE/server/dev-accounts.js`.
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
- Facebook adapter hỗ trợ đọc/quản lý bài Page và đăng; Instagram hỗ trợ phát hiện tài khoản Professional liên kết và đăng ảnh JPG ngay qua Quick Tunnel local hoặc kho media public. Instagram đọc bài, lịch worker, video/reels/comment/insights chưa có adapter thật. Không hiển thị nền tảng khác như đã kết nối; reply/comment chưa có adapter. Worker PostgreSQL hiện chỉ nhận Facebook; chỉ chạy khi người dùng chủ động bật.
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
