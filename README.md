# Omni Studio

Omni Studio quản trị tiếp thị đa kênh với React/Express/PostgreSQL, đăng nhập và phân quyền. Dữ liệu quản trị, lịch đăng và nhật ký được lưu bền vững trên server.

## Đăng nhập, database và lịch sử

### Trạng thái và duyệt lịch đăng

Lịch đọc thêm `published_posts` của các Facebook Page đã kết nối, theo khoảng ngày/tuần/tháng đang xem. Bài đăng trực tiếp trên Facebook cũng xuất hiện với trạng thái Đã đăng, dùng createdTime thực tế và múi giờ lịch. Trùng với workspace/delivery được loại theo provider post ID; thẻ gộp giữ liên kết kế hoạch để xem nguồn duyệt. Mỗi Page tải 25 bài/lượt; dùng **Tải thêm bài Facebook trong kỳ này** nếu còn cursor. Lỗi provider được hiển thị riêng, không coi lịch trống là đã đồng bộ đầy đủ. Bài Page mở bản xem trước có liên kết Facebook; sửa/xóa vẫn ở tab Bài trên nền tảng. Tab Page đối chiếu post ID với các lượt đăng kế hoạch đã tải và đánh dấu khi khớp; bài không khớp ID không tự được xem là đã qua duyệt. Bảng duyệt chỉ gồm kế hoạch được gửi qua Omni Studio, giữ kết quả đăng lịch sử trong database và cung cấp liên kết kiểm tra bài Facebook; xóa kế hoạch không xóa bài trên Page.

Lịch nội dung có bộ lọc và nhãn: **Chưa duyệt**, **Đã duyệt chưa đăng**, **Đã đăng**, **Đã hủy**, cùng Bản nháp/Đang đăng/Lỗi/Cần kiểm tra. `pending` chưa tạo lượt đăng; Admin/Manager bấm **Duyệt & lên lịch** để chuyển thành `scheduled` và tạo hàng đợi. Editor được gửi duyệt nhưng không tự duyệt/đăng. Editor chỉ được gửi duyệt kế hoạch có giờ đăng cách thời điểm gửi **ít nhất 60 phút**; gửi mới hoặc sửa bài chờ duyệt gần hơn bị API từ chối 403. Bản nháp không bị giới hạn này. Gửi duyệt cần PostgreSQL hoạt động để xếp thông báo cho Admin/Manager; email thực tế còn phụ thuộc workflow n8n và SMTP.

**Quản lý bài viết → Duyệt bài viết** là bảng có lọc/tìm kiếm và xuất CSV, hiển thị bài Chưa duyệt, Đã duyệt và Bị từ chối, người tạo, người xử lý, giờ dự kiến và lý do. Chuông thông báo của Admin/Manager liệt kê bài đang chờ và trạng thái email của chính người đăng nhập. Admin/Manager có thể duyệt hoặc từ chối kèm lý do; từ chối không tạo lượt đăng. Chỉ Admin có nút **Xóa** và cần xác nhận trước khi xóa vĩnh viễn kế hoạch, lượt đăng, dữ liệu duyệt/email và lịch sử liên quan khỏi Omni Studio; audit sự kiện xóa được giữ lại. Bài đã đăng trên Facebook không bị xóa. Không thể xóa khi có lượt đang đăng hoặc chưa rõ kết quả; cần kiểm tra Page trước. API `DELETE /api/publishing/plans/:id` yêu cầu quyền Admin, CSRF và JSON `{ "version": 1 }`. Editor sửa bài bị từ chối và gửi lại để duyệt với giờ tương lai cách hiện tại ít nhất 60 phút. Migration 011 bổ sung trạng thái `rejected`; chạy `npm run db:migrate` trước khi dùng bản mới. Email yêu cầu duyệt vốn được xếp cho từng Admin/Manager có địa chỉ thật; workflow n8n đã Publish sẽ nhận và gửi khi đến lượt kiểm tra, không do chuông thông báo gửi trực tiếp.

Bài chưa duyệt đến giờ đăng chuyển `cancelled`. Bài đã duyệt mà lượt đăng vẫn ở hàng đợi sau giờ hẹn **2 phút** cũng chuyển **Đã hủy**; worker không nhận lượt quá hạn này để tránh đăng muộn sau khi khởi động lại. Với kế hoạch lặp, chỉ lượt bị lỡ và các nội dung nối tiếp của lượt đó bị hủy; lượt tương lai vẫn giữ lịch. Lượt đang đăng, đã đăng, lỗi hoặc chưa rõ kết quả được giữ nguyên để kiểm tra, không tự hủy hay đăng lại. Bài lịch workspace cũ quá giờ mà chưa có kết quả đăng cũng được hủy. Backend kiểm tra mỗi 30 giây và khi đọc/lưu kế hoạch; sau thời gian backend tắt, kiểm tra lại khi khởi động. Lý do và lịch sử được lưu trong PostgreSQL. Mục **Đã hủy** hiển thị cả bài ở ngày cũ trong các kế hoạch đã tải: với kế hoạch đã hủy hoàn toàn, chọn **Sửa giờ & gửi lại**, đổi giờ tương lai rồi bấm **Gửi lại lên workspace**. Bài trở về **Chưa duyệt**, cần được duyệt lại. Đã duyệt không đồng nghĩa đã đăng; nhãn **Đã đăng** lấy từ kết quả lượt đăng hoặc từ Facebook Page.

Bảng duyệt rút gọn nội dung dài trong ô; bấm tên bài hoặc **Xem chi tiết** để đọc đầy đủ. Bài đã đăng hiển thị màu xám và khóa thao tác thay đổi.

### Tài khoản test cho dev (chỉ trên máy cục bộ)

Các thông tin dưới đây là credential test công khai, không dùng cho production hoặc triển khai chung qua Internet. Chạy tại gốc repo sau khi cấu hình `BE/.env` và chạy migration:

```powershell
npm run db:migrate
npm run db:dev-accounts
```

| Vai trò | Email đăng nhập trên DB cục bộ hiện tại | Mật khẩu test    | Phạm vi kiểm thử                                                   |
| ------- | --------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Admin   | khaipham111005@gmail.com                | OmniAdmin2026!   | Quản lý thành viên/quyền, cấu hình, dữ liệu và khôi phục snapshot  |
| Manager | manager@omni.test                       | OmniManager2026! | Quản lý dữ liệu, duyệt/lên lịch/đăng bài; không quản lý thành viên |
| Editor  | editor@omni.test                        | OmniEditor2026!  | Soạn nội dung/nháp; không lên lịch hoặc đăng thật                  |
| Viewer  | viewer@omni.test                        | OmniViewer2026!  | Chỉ xem dữ liệu; không tạo/sửa/xóa                                 |

Lệnh chỉ chạy khi PostgreSQL ở localhost và `NODE_ENV` khác `production`; không chạy tự động khi khởi động app. Chạy lại giữ nguyên tài khoản đã tồn tại, không đặt lại mật khẩu/quyền. Mật khẩu trong DB được băm bằng scrypt, không lưu dạng chữ. Tạo user đầu tiên bằng lệnh này sẽ đóng màn hình bootstrap. Mỗi dev cần chạy lệnh trên database cục bộ của mình; trên **database mới**, script tạo Admin với email mặc định `admin@omni.test` và mật khẩu `OmniAdmin2026!`. Các vai trò còn lại dùng email/mật khẩu như bảng trên. Trước khi chia sẻ triển khai, vô hiệu hóa các tài khoản test hoặc đổi toàn bộ mật khẩu bằng tài khoản admin riêng.

Trên database cục bộ hiện tại, đăng nhập **Omni Studio** bằng `khaipham111005@gmail.com` và mật khẩu test `OmniAdmin2026!` (đúng chữ hoa/thường, không thêm khoảng trắng). `admin@omni.test` **không đăng nhập được** vì email Admin đã đổi. `npm run db:dev-accounts` không tạo thêm Admin mặc định nếu đã có Admin đang hoạt động và không đặt lại mật khẩu Admin đã tồn tại. Nếu app báo **“Quá nhiều lần thử. Thử lại sau 15 phút.”** (HTTP 429), ngừng thử và chờ 15 phút; đây là giới hạn đăng nhập, chưa phải kết luận mật khẩu sai. Nếu sau đó app báo **“Email hoặc mật khẩu không đúng.”** (HTTP 401), kiểm tra email và database mà backend đang kết nối; mật khẩu đã đổi của tài khoản hiện có không thể suy ra từ README. Tài khoản Admin Omni Studio khác tài khoản n8n và PostgreSQL. Khi triển khai, đổi mật khẩu test công khai trước khi bật email thật.

Chạy npm run db:migrate và npm run db:generate trước khi khởi động bản mới. Mở UI, tạo quản trị viên đầu tiên (tên, email, mật khẩu ít nhất 12 ký tự). Mật khẩu ứng dụng độc lập với mật khẩu PostgreSQL. Bootstrap đóng sau khi có user đầu tiên. Sau đó admin tạo thành viên và cấp vai trò trong **Thành viên & phân quyền**. API cần session cookie; mutation cần X-CSRF-Token (UI tự gửi). Chưa cấu hình PostgreSQL thì đăng nhập báo lỗi, không chạy các API dữ liệu ở chế độ không bảo vệ.

**Lịch sử hoạt động** giữ người thực hiện/thời gian/thao tác; phiên bản workspace cũ có thể khôi phục bởi admin. Các bảng studio_plan_history/studio_delivery_history giữ thay đổi lịch và trạng thái lượt đăng. **Dữ liệu chức năng** quản lý workflow, số liệu, traffic, báo cáo, thư viện ảnh, nhãn, cấu hình và phiếu duyệt; có nút nhập dữ liệu trình duyệt cũ, merge theo id không ghi đè bản DB. Tắt/mở backend không xóa các bảng này. localStorage riêng theo origin nên nhập ở đúng URL từng dùng. Hoạt động đã mất trước khi audit được thêm không thể tự tái tạo.

| Lệnh                  | Mục đích                                                 |
| --------------------- | -------------------------------------------------------- |
| npm run db:migrate    | Migration có ledger/checksum + backfill bảo toàn dữ liệu |
| npm run db:backup     | pg_dump vào BE/.data/backups                             |
| npm run db:introspect | Đồng bộ Prisma model từ schema SQL (chỉ đọc)             |
| npm run db:generate   | Tạo Prisma Client                                        |
| npm run db:validate   | Kiểm tra Prisma schema                                   |
| npm run test:database | Test PostgreSQL trong schema riêng; provider mock        |

Chi tiết các model, ánh xạ màn hình/API, vai trò và rollback: [DATABASE-ARCHITECTURE.md](DATABASE-ARCHITECTURE.md). Prisma CHECK/trigger/partial index được giữ trong SQL; không dùng Prisma reset/db push trên database hiện có. Instagram hiện chỉ có adapter đăng ảnh ngay; đọc/lịch và các nền tảng khác, SERP, gửi chat và thực thi n8n/RPA cần adapter/config riêng. Ghi dữ liệu nội bộ không có nghĩa đã chạy hoặc đồng bộ dịch vụ.

## Techstack

- Frontend: React 19, Vite 8, Lucide React, CSS token và biểu đồ SVG.
- Backend: Node.js / Express 5, Axios, dotenv.
- Database: PostgreSQL 17+ (máy hiện tại 18), pg + Prisma 6.19.3, bảng nghiệp vụ và lịch sử có kiểm soát phiên bản.
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

| Màn hình                | Thao tác prototype                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Tổng quan               | Hàng chờ duyệt, lịch 7 ngày, lượt đăng, kết nối tài khoản, bản ghi workspace và metrics đã lưu |
| AI Analysis             | Nhập chỉ số Facebook Page theo kỳ, KPI/facts, yêu cầu Gemini, xem căn cứ và lịch sử            |
| Lịch nội dung           | Tuần/tháng, chuyển kỳ, lọc kênh/trạng thái, tạo bài từ ô ngày                                  |
| Hộp thư đa kênh         | Tìm/lọc, xem khách hàng, lưu phản hồi demo, đánh dấu xử lý                                     |
| Cài đặt tài khoản       | Thêm/sửa/xóa bản ghi quản trị                                                                  |
| Quản lý kênh            | Bảng/thẻ, thêm/sửa/xóa kênh demo                                                               |
| Hiệu suất & ngân sách   | Chọn kỳ/kênh, biểu đồ, ngân sách chiến dịch, CSV                                               |
| Thống kê traffic kênh   | Chọn kỳ/kênh, nguồn truy cập, bảng/CSV                                                         |
| Quản lý chiến dịch      | Thêm/sửa/xóa, lọc trạng thái, ngân sách và tiến độ                                             |
| Quản lý bài viết        | Nhiều kênh, preview, ảnh, bình luận, nháp/duyệt/lịch                                           |
| Traffic khách hàng      | Khách hàng, nguồn, truy cập, phân loại lead                                                    |
| Quản lý quảng cáo       | Bản ghi quảng cáo, ngân sách, CTR và lượt nhấp demo                                            |
| Thông tin kênh bài viết | Tiếp cận, tương tác, chi tiết bài đã đăng                                                      |
| Thứ hạng từ khóa Omni   | Theo dõi từ khóa và tăng/giảm hạng demo                                                        |
| gCompare                | So sánh đối thủ, traffic và điểm hiển thị demo                                                 |
| gCheck                  | Form, loading, kết quả mô phỏng và lịch sử                                                     |
| Workflow & RPA          | Theo dõi email duyệt bài, chạy Playwright chụp Dashboard/xuất CSV; cấu hình n8n                |

Bảng hỗ trợ tìm kiếm, lọc kênh, sort, phân trang và CSV. Có xác nhận xóa, loading/empty/error, modal native hỗ trợ Escape/focus, mobile sidebar thu gọn và inbox một cột. Bảng/lịch cuộn trong vùng riêng khi hẹp.

Trang **Tổng quan** đọc `GET /api/dashboard?period=week|month` để hiển thị hàng duyệt, delivery sắp đăng/đã đăng và metrics được ghi nhận; danh tính kết nối đến từ Social API, còn số bản ghi chiến dịch/quảng cáo/khách hàng đến từ workspace. Lượt đăng chỉ tính bài do Omni Studio xử lý, không bao gồm bài đăng trực tiếp trên Page. Reach, clicks và spend là bản ghi nội bộ, chưa tự đồng bộ insight từ Meta. Trang tự làm mới sau 30 giây và khi lịch thay đổi; thiếu PostgreSQL hoặc API lỗi sẽ báo rõ. Xem [bản đồ dữ liệu Tổng quan](DATABASE-ARCHITECTURE.md#tổng-quan-vận-hành).

## AI Analysis MVP (Facebook Page)

**AI Analysis** trong sidebar phân tích tối đa 30 bài của **một Facebook Page đã liên kết** trong kỳ người dùng chọn. Số liệu được người dùng nhập tay hoặc tải CSV theo mẫu; ứng dụng chưa tự lấy Facebook Insights. Chọn nguồn `manual`, `csv` hoặc `demo` và ghi tên nguồn để đối chiếu. Bộ CSV tại [eval/ai-analysis](eval/ai-analysis/README.md) là dữ liệu **tổng hợp cho test/demo**, không phải số liệu Page thật.

CSV dùng UTF-8, header `providerPostId,periodStart,periodEnd,timezone,reach,impressions,interactions,linkClicks,text`. Mỗi hàng là một bài trong đúng kỳ đã chọn. `reach`, `impressions` và `interactions` là số đếm không âm của kỳ; `linkClicks` có thể trống. `interactions` nghĩa là tổng reaction, comment và share; `linkClicks` là lượt nhấp liên kết cùng kỳ. Snapshot lifetime/cumulative không hợp lệ. Trùng Page + post + kỳ hoặc kỳ chồng lấn của cùng bài bị từ chối. Tổng reach theo bài **không phải** unique reach của Page. Backend tính `interactions / reach × 100` và `linkClicks / impressions × 100`; mẫu số thiếu/0 cho kết quả `null` kèm lý do. Không suy ra ROI, ROAS hoặc CPL từ các cột này. Phạm vi báo cáo là **các bài đã chọn**, không tự nhận là toàn Page.

Luồng sử dụng: đăng nhập Admin/Manager, mở AI Analysis, chọn Page/kỳ và xem trước hàng CSV hoặc nhập tay; sửa lỗi trước khi lưu batch. Xem KPI/fact và vùng xem trước đúng dữ liệu sẽ rời server tới Gemini, rồi bấm **Phân tích bằng AI**. AI chỉ giải thích facts bằng tiếng Việt và đề xuất tối đa 3 thử nghiệm; từng nhận xét mở được fact ID/căn cứ. Danh sách lịch sử mở lại báo cáo đã lưu; có xuất CSV và in từ trình duyệt. Đổi Page/kỳ hoặc filter không tự gọi AI. Editor/Viewer được xem lịch sử nhưng không tạo yêu cầu có chi phí. AI không sửa ngân sách, lịch đăng hoặc bài viết. Nếu provider lỗi, KPI đã tính vẫn xem được và UI báo lỗi thật.

Trên database dev được phép cập nhật, chạy migration 012 và generate Prisma Client trước khi mở AI Analysis:

```powershell
npm run db:migrate
npm run db:generate
```

**Không chạy migration chỉ để kiểm tra trên database người dùng**; `npm run test:database` dùng schema tạm riêng. Điền các biến dưới đây trong `BE/.env` riêng tư, khởi động lại backend. Không đưa API key vào biến `VITE_`, workspace, CSV hoặc Git.

```dotenv
AI_GEMINI_API_KEY=
AI_GEMINI_MODEL=gemini-2.5-flash-lite
AI_GEMINI_FREE_TIER_ONLY=true
AI_DAILY_REQUEST_LIMIT=10
AI_MAX_INPUT_TOKENS=200000
AI_MAX_OUTPUT_TOKENS=1200
AI_TIMEOUT_MS=20000
```

Mặc định backend chỉ cho phép `gemini-2.5-flash-lite`, model có input/output miễn phí trong [Gemini API Free Tier](https://ai.google.dev/gemini-api/docs/pricing) và [hỗ trợ structured output](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite). Tạo API key bằng **project có Billing Tier = Free**, không liên kết tài khoản thanh toán; kiểm tra trạng thái này trong [AI Studio](https://ai.google.dev/gemini-api/docs/billing) trước khi điền key. Backend không thể tự xác minh tier của project chỉ từ API key: `AI_GEMINI_FREE_TIER_ONLY=true` khóa model và bỏ yêu cầu đơn giá, nhưng không tự biến key Paid Tier thành miễn phí. Quota thực tế do Google quyết định; xem trong AI Studio. Free Tier cho phép Google dùng nội dung gửi lên để cải thiện sản phẩm, nên chỉ gửi dữ liệu mẫu hoặc dữ liệu được phép chia sẻ.

`AI_MAX_INPUT_TOKENS` dùng số byte UTF-8 như một cận trên thận trọng cho token đầu vào; giảm giá trị này có thể từ chối báo cáo nhiều bài/text dài. Hạn mức nội bộ mặc định là 10 yêu cầu/ngày cho workspace, cache theo snapshot và version để tránh gọi lại không cần thiết. Trong chế độ Free Tier, báo cáo lưu usage token nhưng chi phí VND thực tế là `null` vì ứng dụng không kiểm chứng billing; không cần cấu hình ngân sách hoặc đơn giá. Không có key thì KPI vẫn xem được, AI báo chưa cấu hình. Test tự động dùng provider mock, không gọi Gemini thật.

Chỉ khi chủ động dùng Paid Tier: đặt `AI_GEMINI_FREE_TIER_ONLY=false`, chọn `AI_GEMINI_MODEL` hỗ trợ structured output, và khai báo `AI_DAILY_BUDGET_VND`, `AI_INPUT_PRICE_VND_PER_MILLION_TOKENS`, `AI_OUTPUT_PRICE_VND_PER_MILLION_TOKENS` theo [giá hiện hành](https://ai.google.dev/gemini-api/docs/pricing) và tỷ giá áp dụng. Backend khi đó mới cho gọi sau khi có ngân sách/đơn giá dương; timeout vẫn có thể phát sinh chi phí và usage không rõ được giữ `null`.

Demo an toàn: dùng một Page thử đã liên kết, chọn một CSV tổng hợp `V01` với nguồn `demo`, kiểm tra preview và KPI, mở vùng dữ liệu gửi AI; chỉ bấm phân tích thật sau khi đã kiểm tra key thuộc project Free Tier. Sau đó mở căn cứ từng nhận xét, lịch sử, CSV/in; thử `V04` để xem mẫu số 0 và tắt provider để xem lỗi mà KPI vẫn còn. Không cần bật publishing worker, gửi email hoặc đăng bài.

## PostgreSQL và n8n

Cần Docker Desktop chạy Linux containers. Tạo `BE/.env` từ mẫu, thay N8N_ENCRYPTION_KEY bằng chuỗi ngẫu nhiên dài và cấu hình mật khẩu local. **Chỉ khi máy chưa có PostgreSQL ở cổng 5432**, chạy tại gốc:

```powershell
docker compose --env-file BE/.env -f BE/compose.yaml up -d
```

Trong chế độ này, PostgreSQL ở localhost:5432, user omni, database omni. Với mật khẩu mẫu dành cho local:

```env
DATABASE_URL=postgresql://omni:omni_local_dev@localhost:5432/omni
```

Khởi động lại Express. UI báo nguồn lưu PostgreSQL. GET /api/workspace khởi tạo workspace rỗng khi DB trống; PUT lưu snapshot JSONB và tăng version. Phiên bản cũ trả 409, yêu cầu tải lại để tránh ghi đè. Đây là một workspace chung có bảng quan hệ và phân quyền thành viên; chưa cách ly nhiều tenant.

n8n ở http://localhost:5678. Hoàn tất thiết lập local và import BE/workflows/content-review.n8n.json. Workflow không active; Manual Trigger chỉ chuẩn bị bản ghi chờ con người duyệt. Workflow n8n chưa tích hợp tự đăng; worker Publishing riêng được mô tả bên dưới. BE/db/init.sql tạo database n8n riêng khi volume PostgreSQL khởi tạo lần đầu. Không xóa volume nếu cần giữ dữ liệu.

Compose dùng image n8n latest cho local; ghim tag/digest đã kiểm tra trước khi triển khai ổn định. PostgreSQL thật đã được kiểm tra bằng migration và integration test; các workflow n8n vẫn chưa được import hoặc kích hoạt.

### Email duyệt bài và RPA Playwright

#### 1. Khởi động n8n

Máy đã có PostgreSQL chạy trên Windows tại cổng 5432 (như máy phát triển hiện tại): khởi động **chỉ n8n**, tránh hai PostgreSQL tranh cổng. Chạy tại gốc repo:

```powershell
docker compose --env-file BE/.env -f BE/compose.n8n-host.yaml up -d
docker compose --env-file BE/.env -f BE/compose.n8n-host.yaml ps
```

Mở http://localhost:5678. Ở lần đầu, n8n có thể chuyển đến `/setup` để tạo **owner account của n8n**; tài khoản này độc lập với Admin Omni Studio và PostgreSQL. n8n lưu cấu hình/credential đã mã hóa trong volume `n8n_host_data`; giữ nguyên volume và `N8N_ENCRYPTION_KEY` khi khởi động lại. Dừng dịch vụ bằng `docker compose --env-file BE/.env -f BE/compose.n8n-host.yaml down` (không thêm `-v`). Nếu trang chưa mở, xem `docker compose --env-file BE/.env -f BE/compose.n8n-host.yaml logs --tail 80 n8n` và kiểm tra cổng 5678.

Compose gốc `BE/compose.yaml` dành cho máy **chưa có PostgreSQL** và muốn tạo PostgreSQL+n8n mới. Chỉ chọn một chế độ; không chạy cả hai Compose cùng lúc. Không xóa volume PostgreSQL hiện có để xử lý lỗi n8n.

#### 2. Chuẩn bị database và người nhận

Chạy `npm run db:migrate` để thêm migration 013 (cùng các migration trước đó nếu chưa áp dụng). Khi Editor gửi bài chờ duyệt, PostgreSQL xếp một email cho mỗi Admin/Manager đang hoạt động có địa chỉ thật; địa chỉ `.test` bị loại. Workflow n8n tạo một job `approval_read` theo ID/phiên bản bài. Worker Playwright đăng nhập WebApp, mở **Bài viết → Duyệt bài → Chưa duyệt → Xem chi tiết** và lưu tên, người gửi, nội dung, Page, giờ dự kiến cùng thời điểm đọc vào `studio_rpa_runs`. n8n chỉ gửi email sau khi job thành công và bài vẫn `pending` ở đúng phiên bản, giờ đăng còn tương lai và người nhận còn quyền. Nhắc gần giờ đăng chỉ xếp sau khi bài đã chờ ít nhất một giờ, để tránh email thứ hai ngay khi gửi duyệt. Trạng thái email và job xem tại **Workflow & RPA**. Duyệt/từ chối vẫn là thao tác của Admin/Manager trên WebApp; RPA không bấm quyết định hoặc đăng Facebook.

Trên database cục bộ hiện tại, Admin nhận thư là `khaipham111005@gmail.com`; dev khác phải đặt email thật cho Admin/Manager của database họ. Email của tài khoản quản trị n8n **không** quyết định người nhận. Kiểm tra trong Omni Studio → **Thành viên & phân quyền** trước khi bật gửi thư.

#### 3. Tạo hai credential trong n8n

Trong n8n → **Credentials** (hoặc mở node rồi chọn **Create new credential**):

1. **Postgres** cho các node PostgreSQL của workflow: Host `host.docker.internal` nếu n8n chạy Docker và PostgreSQL chạy trên Windows host; Port `5432`; Database là tên database ứng dụng trong `DATABASE_URL` (máy hiện tại `OmniChannel`); User/Password là tài khoản PostgreSQL tương ứng. `localhost` trong container chỉ chính container n8n, không phải Windows host. Kiểm tra kết nối trước khi tiếp tục. Nếu PostgreSQL nằm trong Compose gốc, dùng Host `postgres` và database ứng dụng `omni`. Database `n8n` của Compose gốc chỉ lưu cấu hình n8n, không chứa bài viết Omni Studio. Nếu kết nối từ container bị từ chối dù BE kết nối được, kiểm tra `listen_addresses`, `pg_hba.conf` và quyền truy cập từ mạng Docker thay vì đổi mật khẩu một cách mù quáng.
2. **Send Email (SMTP)** cho node gửi thư: User là địa chỉ _gửi_; Password là mật khẩu SMTP/app password của hộp thư gửi; Host/Port theo nhà cung cấp. Cổng 465 bật **SSL/TLS**; cổng 587 tắt công tắc SSL/TLS để dùng **STARTTLS** (không bật **Disable STARTTLS**). **From Email** trong node phải là địa chỉ nhà cung cấp cho phép gửi, ví dụ `Omni Studio <sender@example.com>`. **To Email** giữ biểu thức `{{ $json.recipient_email }}` để lấy người nhận Admin/Manager từ database. Địa chỉ gửi có thể khác `khaipham111005@gmail.com`.

Nếu dùng Gmail làm **địa chỉ gửi**, tạo Google App Password sau khi bật xác minh hai bước, rồi nhập mật khẩu ứng dụng đó vào ô Password của SMTP credential; không dùng mật khẩu đăng nhập Gmail thông thường. Gmail SMTP: Host `smtp.gmail.com`, Port `465`, bật SSL/TLS; User là địa chỉ Gmail gửi. Google chỉ hiển thị App Password lúc tạo; nếu chưa lưu thì tạo cái mới. Với SMTP nhà cung cấp khác, dùng thông số chính thức của nhà cung cấp. Không đưa mật khẩu, App Password hay `DATABASE_URL` vào README, Git, ảnh chụp hoặc chat. Xem [n8n Send Email credential](https://docs.n8n.io/integrations/builtin/credentials/send-email/) và [Google App Password](https://support.google.com/accounts/answer/185833?hl=en).

#### 4. Chạy demo an toàn với SMTP mock

Để demo không gửi thư thật, chạy Mailpit bằng profile `demo-mail` của Compose đang dùng, ví dụ `docker compose --profile demo-mail --env-file BE/.env -f BE/compose.n8n-host.yaml up -d n8n mailpit` (đổi sang `BE/compose.yaml` nếu dùng PostgreSQL trong Compose). Trong n8n, SMTP credential trỏ Host `mailpit`, Port `1025`, không bật SSL/TLS, không cần xác thực SMTP; mở hộp thư mock ở http://localhost:8025. Đặt email Admin/Manager thử nghiệm không có đuôi `.test` để outbox tạo thông báo. Không điền SMTP production cho bước này.

Đặt `RPA_EMAIL`/`RPA_PASSWORD` cho tài khoản Omni Studio riêng, ưu tiên Viewer chỉ đọc; đặt `RPA_BASE_URL=http://127.0.0.1:5173` nếu FE chạy Vite, hoặc `http://127.0.0.1:3000` nếu đã build và dùng `npm start`. Khởi động API, FE, rồi `npm run worker:rpa`. Worker chỉ kết nối origin loopback và không gửi mail.

Import [post-approval-email.n8n.json](BE/workflows/post-approval-email.n8n.json) vào n8n nhưng **giữ chưa Publish**. Gán PostgreSQL credential cho bốn node `Queue approval reads`, `Claim ready notifications`, `Preflight current revision`, `Mark email sent`; gán SMTP mock cho `Send approval email`, sửa `From Email`. Link trong nội dung mail mặc định dùng `http://localhost:5173`; sửa origin này trong node nếu người nhận dùng máy khác hoặc FE phục vụ từ cổng 3000. Tài khoản Editor gửi một bài chờ duyệt có giờ đăng cách hiện tại ít nhất 60 phút. Trong n8n, chạy workflow thủ công một lần để xếp job, chờ worker đọc bài (tối đa khoảng 30 giây), rồi chạy thủ công lần nữa để gửi thư. Mở hộp thư web SMTP mock, chọn link trong thư, đăng nhập Admin/Manager và tự bấm **Duyệt** hoặc **Từ chối**. Kiểm tra job và email ở **Workflow & RPA**. Không cần bật publishing worker.

Workflow chỉ đánh dấu `sent` sau node SMTP thành công. Mỗi recipient/phiên bản có một outbox row và mỗi phiên bản có một RPA job. `sending` không tự nhận lại khi n8n hoặc SMTP lỗi để tránh gửi lặp khi kết quả SMTP chưa rõ; kiểm tra hộp thư/Executions trước khi xử lý thủ công. Trước node SMTP, workflow kiểm tra lại phiên bản/trạng thái bài và người nhận; bài đã duyệt, từ chối, hủy hoặc quá giờ bị loại. Một thay đổi đúng lúc giữa kiểm tra này và thao tác SMTP vẫn là khoảng đua ngoài giao dịch; cần kiểm tra lại trên WebApp trước khi ra quyết định. Nếu muốn chạy lịch 5 phút sau demo, chỉ Publish workflow sau khi SMTP và địa chỉ người nhận đã được kiểm chứng.

#### 5. Chạy RPA theo lịch (tùy chọn)

Import thêm [workflow chụp Dashboard](BE/workflows/rpa-dashboard.n8n.json) (08:00 hằng ngày) và [workflow xuất CSV](BE/workflows/rpa-weekly-csv.n8n.json) (08:15 thứ Hai), gán PostgreSQL credential. Hai workflow chỉ xếp việc. Cùng worker RPA có thể chụp Dashboard/xuất CSV vào `BE/rpa/output/<run-id>/`; tải file từ **Workflow & RPA**. CSV là bản xuất nghiệp vụ, không thay thế backup PostgreSQL.

Các workflow JSON trong repo mặc định chưa Publish. Demo dùng SMTP mock; việc gửi email thật cần credential do chủ hộp thư tự nhập và tự kích hoạt n8n.

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

Collection Postman có health, workspace, schema, validation Facebook rỗng và các GET social. Điền accountId từ GET social/accounts để đọc bài Page; Collection Runner không đăng thật.

API cũ POST /api/publish/facebook nhận:

```json
{ "noiDungBaiViet": "Nội dung đã được duyệt" }
```

Cần PAGE_ID và PAGE_ACCESS_TOKEN trên server cho Facebook. Trong trình soạn bài chọn tài khoản đã xác minh, rồi **Đăng ngay** và xác nhận. Facebook nhận văn bản và ảnh tùy chọn JPG/PNG/WebP/GIF tối đa 1 MB. Instagram yêu cầu JPG tối đa 1 MB và tài khoản Professional đã liên kết. Khi phát triển local, cài `cloudflared` (`winget install --id Cloudflare.cloudflared --exact`) để backend mở Cloudflare Quick Tunnel tạm thời chỉ cho một URL ảnh ngẫu nhiên; không cần bucket hay tài khoản Cloudflare. Meta tải ảnh từ URL này trong lúc backend tạo media container, chờ `FINISHED`, rồi gọi `media_publish`; tunnel và endpoint ảnh đóng sau yêu cầu. Quick Tunnel chỉ dành cho phát triển/thử nghiệm; URL công khai tạm thời trong lúc đăng và ai biết URL có thể tải ảnh. Để triển khai ổn định, dùng bucket S3-compatible công khai cấu hình bằng sáu biến `INSTAGRAM_MEDIA_*`; có thể đặt `INSTAGRAM_MEDIA_TUNNEL_ENABLED=false` để tắt tunnel. Không gửi bình luận/lịch worker Instagram. Lỗi provider/timeout trả 502; token hết hạn 401; thiếu quyền 403. Không tự retry khi chưa rõ Instagram đã đăng hay chưa. Test tự động dùng mock; không đăng bài thật.

## Đăng bài Threads

Threads dùng OAuth riêng của Threads App. Meta không chấp nhận `localhost` cho redirect OAuth Threads và yêu cầu HTTPS; dùng Quick Tunnel HTTPS trỏ vào Vite. Chạy `npm run dev` trước, rồi terminal thứ ba chạy `cloudflared tunnel --url http://localhost:5173`; lấy hostname `https://...trycloudflare.com` hiện ra. Dừng Vite rồi mở lại trong PowerShell với `$env:THREADS_DEV_HOST='...trycloudflare.com'; npm run dev` (chỉ hostname, không có `https://`). Điền `SOCIAL_UI_ORIGIN` bằng origin tunnel và `THREADS_REDIRECT_URI` bằng `<origin tunnel>/api/social/threads/callback` trong `BE/.env`; thêm chính xác callback đó vào Threads App Dashboard. Điền Threads App ID/Secret riêng, bật Threads use case cùng quyền `threads_basic` và `threads_content_publish`, rồi khởi động lại API. Giữ cả Vite và tunnel chạy, sau đó mở Omni Studio bằng URL tunnel để đăng nhập và liên kết. Khóa `SOCIAL_TOKEN_ENCRYPTION_KEY` hiện có dùng chung để mã hóa token trong vault backend.

Sau khi liên kết tài khoản ở **Liên kết tài khoản**, Composer cho đăng văn bản tối đa 500 ký tự hoặc một ảnh JPG tối đa 1 MB. Đăng chữ không cần dịch vụ media; đăng ảnh dùng Quick Tunnel nếu đã cài `cloudflared`, hoặc bucket công khai cấu hình qua các biến `INSTAGRAM_MEDIA_*`. Callback đổi token thành long-lived token và lưu danh tính/token trong `BE/.data/social-tokens.enc`. Lịch, gửi duyệt, đọc/sửa/xóa bài Threads chưa được hỗ trợ. Test OAuth và publish chỉ dùng mock, không gửi bài thật.

## Kiểm tra

```powershell
npm run build
npm run check
npm test
npm run format:check
```

Node test runner kiểm tra schema/persistence, lọc đa kênh, CSV an toàn, validation lịch, HTTP/static/Swagger, Facebook mock, lỗi DB, version conflict và parameterized SQL. Build kiểm tra JSX/bundle. npm run format chuẩn hóa source và tài liệu.

## Giới hạn

UI và lưu dữ liệu quản trị hoạt động. Analytics, chat và SERP chưa có nguồn/tích hợp thật. Facebook đã có danh tính Page, quản lý bài, đăng ảnh và luồng OAuth; Instagram hỗ trợ phát hiện tài khoản và đăng ảnh JPG ngay qua tunnel tạm khi chạy local hoặc kho media công khai khi triển khai; chưa đọc bài/lịch worker Instagram. Các nền tảng khác chưa có adapter. Lịch workspace cục bộ chỉ lưu cấu hình; lịch PostgreSQL có worker Publishing riêng opt-in. Ảnh chỉ được gửi khi người dùng đính kèm file hợp lệ. Control định dạng dùng Markdown để preview; API Facebook gửi nguyên văn. Server dành cho phát triển local; cần hoàn thiện các phần này trước khi triển khai nhiều người dùng.

Workspace mới không tự nạp dữ liệu mẫu. FE loại các bản ghi mẫu nguyên bản khi đọc dữ liệu cũ, giữ bản ghi người dùng tạo/chỉnh sửa và bài có facebookPostId. Dữ liệu local được ghi lại sau khi tải; snapshot PostgreSQL cũ được lọc trên FE và chỉ ghi lại khi người dùng lưu thay đổi, không tự xóa dữ liệu DB. seed() chỉ còn dùng cho fixture kiểm thử/nhận diện mẫu cũ. Nút khôi phục dữ liệu demo và ảnh preview mẫu đã bỏ.

## Liên kết Facebook và quản lý bài trên Page

Màn hình **Liên kết tài khoản**, **Cài đặt tài khoản** và **Quản lý kênh** hiển thị danh tính do backend xác minh. Token Page trong BE/.env có thể xác minh Page Facebook và phát hiện tài khoản Instagram Professional được liên kết nếu token có quyền Instagram. OAuth Facebook yêu cầu `instagram_basic` và `instagram_content_publish` để phát hiện quan hệ này. Instagram chỉ xuất hiện trong trình soạn khi danh tính đã xác minh và media hosting khả dụng (Quick Tunnel local hoặc kho công khai).

Trong môi trường local, cài `cloudflared` bằng `winget install --id Cloudflare.cloudflared --exact`, mở terminal mới rồi khởi động lại API. Không cần thêm credential media vào BE/.env: API tự mở một Quick Tunnel trong lúc đăng và chỉ cung cấp endpoint ảnh một lần. Có thể tắt bằng `INSTAGRAM_MEDIA_TUNNEL_ENABLED=false`. Quick Tunnel là dịch vụ thử nghiệm công khai và tạm thời; không dùng làm hosting sản xuất.

Để triển khai ổn định hoặc tránh tunnel, cấu hình `INSTAGRAM_MEDIA_ENDPOINT`, `INSTAGRAM_MEDIA_REGION`, `INSTAGRAM_MEDIA_BUCKET`, `INSTAGRAM_MEDIA_ACCESS_KEY`, `INSTAGRAM_MEDIA_SECRET_KEY` và `INSTAGRAM_MEDIA_PUBLIC_ORIGIN` trong BE/.env cho một bucket tương thích S3. Public origin phải cho Meta tải object không cần xác thực; nên bật lifecycle xóa object tạm sau một khoảng thời gian phù hợp. Khởi động lại API sau khi lưu cấu hình. Composer chỉ gửi ảnh JPG (tối đa 1 MB) lên Instagram. Đăng ngay hỗ trợ Graph API container/publish; đọc bài Instagram và lịch worker Instagram chưa hỗ trợ. Không lưu credential kho media ở frontend.

Ví dụ Cloudflare R2: endpoint là `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region là `auto`, bucket là tên bucket R2. Tạo R2 API token giới hạn đúng bucket với Object Read & Write; `INSTAGRAM_MEDIA_PUBLIC_ORIGIN` là custom domain công khai đã nối bucket (R2 `r2.dev` chỉ nên dùng phát triển). Thiết lập lifecycle cho prefix `instagram/` để dọn ảnh đã tải lên. Xem [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) và [object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

Trong **Quản lý bài viết → Bài trên nền tảng**, chọn Page để tải bài đã đăng trực tiếp từ Facebook, gồm bài được tạo bằng Facebook/Business Suite. Dùng **Tải thêm bài cũ** để xem các trang tiếp theo (25 bài mỗi lần); không chỉ hiển thị bài do Omni Studio tạo. Có link mở bài, sửa văn bản và xóa bài với xác nhận. API quyền/loại bài có thể từ chối thao tác; lỗi được hiển thị. Sửa ảnh/video, nháp/lịch tạo trong Meta, comment, video/reels và insights chưa được tích hợp. Tab **Nháp & lịch trong workspace** tách dữ liệu cục bộ/PostgreSQL; lỗi DB không chặn đọc bài Page nhưng không âm thầm ghi đè dữ liệu local.

Để cấp quyền qua Facebook Login thay vì nhập token thủ công, điền BE/.env:

```env
FACEBOOK_APP_ID=APP_ID_CUA_BAN
FACEBOOK_APP_SECRET=APP_SECRET_CUA_BAN
FACEBOOK_REDIRECT_URI=http://localhost:3000/api/social/facebook/callback
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_REDIRECT_URI=https://<quick-tunnel-host>/api/social/threads/callback
SOCIAL_UI_ORIGIN=https://<quick-tunnel-host>
SOCIAL_TOKEN_ENCRYPTION_KEY=KHOA_32_BYTE_BASE64
GRAPH_API_VERSION=v21.0
```

SOCIAL_UI_ORIGIN là origin FE bạn dùng: 5173 khi chạy Vite hoặc 3000 khi dùng bản build; nếu thử trên 3001 thì thay URL tương ứng. FACEBOOK_REDIRECT_URI luôn trỏ vào backend và phải khớp chính xác **Valid OAuth Redirect URIs** trong cấu hình Facebook Login của app Meta. Khởi động lại BE sau khi sửa .env. Backend đã thêm khóa mã hóa ngẫu nhiên nếu file hiện có thiếu khóa; đừng thay khóa khi đã có token lưu. Có thể tạo khóa mới cho môi trường mới bằng `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Giữ App Secret/khóa/token riêng trên backend, không dùng VITE_ hoặc commit file.

Bấm **Liên kết Facebook**, cấp các quyền pages_show_list/pages_read_engagement/pages_manage_posts và instagram_basic/instagram_content_publish ở trang Meta, rồi chọn Page muốn quản lý. Callback có state ngẫu nhiên, cookie HttpOnly/SameSite và phiên 10 phút; code OAuth đổi sang User Token dài hạn trên backend rồi lấy Page Token. Frontend chỉ nhận ID/tên/avatar để chọn tài khoản; token không đi vào localStorage hoặc workspace. Page Token được mã hóa AES-256-GCM tại BE/.data/social-tokens.enc (gitignored). Luồng chuẩn lấy Page Token tham khảo [collection chính thức Meta](https://www.postman.com/meta/facebook/request/bqfxwbp/get-access-tokens-of-pages-you-manage). Quyền/app review và phạm vi Page vẫn phụ thuộc cấu hình Meta; không tự cấp thêm quyền hoặc đưa app live.

**Đăng ảnh:** trong trình soạn chọn Page đã liên kết, thêm một ảnh và nội dung, rồi Tùy chọn → Đăng ngay lên các Page → xác nhận. Backend kiểm tra MIME, magic bytes và giới hạn 1 MB, chuyển ảnh thành binary multipart lên /photos với caption. Không có ảnh thì dùng /feed. requestId chống gửi lặp trong cùng tiến trình BE trong 24 giờ; không phải cơ chế bền vững qua restart. Nếu request timeout/kết quả chưa rõ, kiểm tra tab Bài trên nền tảng trước khi đăng lại. Lịch cục bộ chưa tự đăng; xem phần Publishing về lịch server và worker.

Đã xác minh đọc tên/avatar ITM và 4 bài Page thật; test đăng ảnh, sửa/xóa và OAuth dùng mock. Chưa cấp quyền OAuth thực tế do cấu hình App ID/Secret chưa hoàn tất; chưa đăng thêm ảnh/bài hoặc sửa/xóa bài thật để kiểm tra tính năng mới.

Trong tab **Bài trên nền tảng**, bộ lọc hiển thị Facebook, Instagram, Google, TikTok, YouTube và Zalo cùng số tài khoản đã xác minh hoặc trạng thái chưa tích hợp. Instagram Professional liên kết với Page được phát hiện và xác minh danh tính. Đăng ngay ảnh JPG dùng Graph API container/publish với Quick Tunnel local hoặc kho media S3-compatible công khai; chưa hỗ trợ đọc bài Instagram, video/reels hay lịch worker Instagram. Không dùng URL ảnh tùy ý. Các nền tảng khác vẫn cần adapter API và luồng cấp quyền riêng. Nút **Quản lý kết nối** mở màn hình cấu hình liên kết.

# Lịch và kế hoạch đăng bài

Quản lý bài viết mở tab **Lịch & kế hoạch**: tài khoản thật bên trái, lịch theo giờ bên phải, đổi Ngày/Tuần/Tháng và múi giờ GMT+7/GMT+8/UTC. Nhấp ô giờ để soạn; menu trên thẻ cho phép sửa bản soạn hoặc hủy các lượt server còn chờ. Tab **Bài trên nền tảng** giữ khả năng đọc/sửa/xóa bài thật trên Facebook.

Composer mới chọn nhiều Page đã xác minh, tối đa 10 nội dung nối tiếp, ảnh riêng từng nội dung, đếm ký tự, preview theo nền tảng, độ trễ và lặp ngày/tuần tối đa 30 lượt. Có thể gắn một nhãn quản lý nội bộ (tối đa 50 ký tự) cho kế hoạch; nhãn được lưu và mở lại cùng kế hoạch, không tự chèn vào bài đăng. Reply/bình luận chỉ lưu bản soạn; server từ chối scheduled reply bằng 422. Chỉ Facebook có adapter thực thi; preview LinkedIn/X hoặc các kênh khác không cấp khả năng đăng thật.

Kho kế hoạch server dùng hai bảng **publishing_plans** và **publishing_deliveries**, tách khỏi snapshot workspace. Chạy tại gốc:

```powershell
npm run db:migrate
```

Kiểm tra `GET /api/publishing/status`: `ready=true` khi DB và migration dùng được. Khi chưa sẵn sàng, UI cho lưu bản soạn/lịch vào workspace; lịch này **không tự đăng**. Không âm thầm chuyển hoặc xóa dữ liệu cũ. `PUT` kế hoạch yêu cầu version; 409 phải tải lại.

Nếu workspace cũng tải lỗi, composer giữ nguyên nội dung và báo nguyên nhân, không chuyển sang lưu cục bộ tự động. PostgreSQL `28P01` nghĩa là thông tin đăng nhập không được chấp nhận: sửa `DATABASE_URL` trong `BE/.env`, dùng đúng tài khoản/mật khẩu và tên database (ví dụ `OmniChannel`), rồi khởi động lại backend. Ký tự đặc biệt trong mật khẩu phải URL-encode (`@` → `%40`, `#` → `%23`, `%` → `%25`). Sau khi kết nối được, chạy `npm run db:migrate`, kiểm tra lại `ready=true`, rồi mới lưu lịch và chạy worker. Không gửi mật khẩu/token vào chat.

Để chủ động thực thi lịch thật, đặt `PUBLISHING_WORKER_ENABLED=true` trong BE/.env, khởi động lại BE, rồi chạy terminal thứ ba:

```powershell
npm run worker:publishing
```

Worker là tiến trình riêng; flag `workerEnabled` trên API chỉ là cấu hình, không phải heartbeat. Mặc định tắt và không chạy trong kiểm thử. Worker nhận job đến hạn từ PostgreSQL; lưu kết quả theo từng Page/nội dung/lượt lặp. Hủy kế hoạch chỉ hủy queued; running có thể đã gửi. Timeout/gián đoạn được đánh dấu **unknown**, không tự retry; kiểm tra Page trước khi tạo kế hoạch mới. Đăng ngay từ composer chỉ gửi bài chính lên các Page đã chọn sau xác nhận, không gửi chuỗi/lặp lại.

Trên lịch, Admin/Manager có nút **Đăng ngay** dưới thẻ **Đã duyệt chưa đăng** của bài chính còn trong hàng đợi server. Trong **Chỉnh sửa kế hoạch**, menu **Tùy chọn → Đăng ngay** dùng chính lượt đăng của thẻ đã mở; nếu vừa sửa nội dung, cần **Lưu thay đổi** rồi mở lại trước khi đăng. Xác nhận sẽ gửi riêng lượt đó lên Facebook Page ngay cả khi worker đang tắt; kết quả được lưu trên delivery và worker không gửi lại cùng lượt vào giờ hẹn. Bài chờ duyệt, bản soạn cục bộ, lượt đã hủy/đang đăng/đã đăng và nội dung nối tiếp không có nút này. Nếu kết quả **Cần kiểm tra**, xem Page trước khi tạo lượt khác để tránh trùng. API `POST /api/publishing/plans/:id/deliveries/:deliveryId/publish-now` yêu cầu Admin/Manager, CSRF và `version` hiện tại; 409 nghĩa là trạng thái đã thay đổi, cần tải lại. Kiểm thử tự động dùng Facebook mock, không gửi bài thật.

Migration trên PostgreSQL cục bộ và `npm run test:database` đã chạy thành công; kiểm thử Facebook trong test vẫn dùng mock, không đăng ảnh thật. Xem [bản thảo kiến trúc](PUBLISHING-ARCHITECTURE.md) để biết trạng thái, thiết kế dữ liệu và giới hạn rollout.
Tên kế hoạch trong composer là tên quản lý nội bộ, không phải tiêu đề riêng được gửi lên Facebook. Có thể bỏ trống: FE và API kế hoạch tự lấy dòng đầu nội dung làm tên (tối đa 180 ký tự). Nội dung bài chính vẫn bắt buộc; ô nối tiếp trống không có ảnh được bỏ qua khi lưu. Khi sửa bản soạn, **Lưu thay đổi** giữ trạng thái hiện tại; **Đổi lịch đăng** là thao tác riêng.

Admin có thể đặt lại mật khẩu thành viên trong Thành viên & phân quyền, cần xác nhận mật khẩu admin hiện tại; tất cả phiên của thành viên được thu hồi. Người dùng tự đổi mật khẩu từ menu Đổi mật khẩu.

## URL công khai cho Meta App Review

Hai trang tĩnh trong `docs/` dùng cho mục **Cài đặt ứng dụng → Thông tin cơ bản** của Meta: `privacy-policy.html` và `data-deletion.html`. Email liên hệ công khai trên hai trang là `khaipham111005@gmail.com`, theo lựa chọn của người vận hành. Trước khi công bố, đọc lại nội dung để xác nhận đúng cách triển khai và xử lý yêu cầu xóa dữ liệu. Các trang này chỉ cung cấp thông tin và hướng dẫn gửi yêu cầu; chúng không tự động xóa dữ liệu PostgreSQL hoặc bài Facebook.

Có thể lấy URL HTTPS miễn phí bằng GitHub Pages cho repository `HuyyTraan/DACN`:

1. Đưa các file `docs/` lên một nhánh đã push tới GitHub và dự định giữ lâu dài (thường là `main`). Không push `BE/.env`, token, khóa mã hóa hoặc bản sao dữ liệu lên GitHub.
2. Trong repository GitHub, mở **Settings → Pages → Build and deployment**. Chọn **Deploy from a branch**, chọn nhánh chứa `docs/`, thư mục **/docs**, rồi **Save**. Nếu dùng tài khoản GitHub Free, repo cần công khai để dùng Pages.
3. Chờ GitHub hiển thị địa chỉ Pages rồi mở bằng cửa sổ ẩn danh để xác nhận cả hai trang tải được. Với repo/owner hiện tại, địa chỉ dự kiến là `https://huyytraan.github.io/DACN/privacy-policy.html` và `https://huyytraan.github.io/DACN/data-deletion.html`; **chỉ điền vào Meta khi các URL thực tế đã hoạt động**.
4. Dán URL thứ nhất vào **URL chính sách quyền riêng tư**. Ở **Xóa dữ liệu người dùng**, giữ tùy chọn **URL hướng dẫn xóa dữ liệu** và dán URL thứ hai. Lưu thay đổi, tải lại để xem Meta còn báo thiếu trường nào.

GitHub Pages chỉ lưu trữ các trang chính sách, không triển khai backend OAuth hoặc tự chuyển ứng dụng Meta sang Live. Sau khi hoàn tất các trường, kiểm tra lại trang **Đăng** và các yêu cầu quyền/App Review của Meta; không kết luận bài Facebook cũ sẽ tự công khai sau khi đổi trạng thái ứng dụng.
