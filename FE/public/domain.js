(function (root) {
    'use strict';
    const key = 'omni-studio-v1';
    const today = '2026-10-10';
    const platforms = ['Facebook', 'Instagram', 'Google', 'TikTok', 'YouTube', 'Zalo'];
    const accountNames = [
        'Linh Nguyễn',
        'Minh Anh',
        'Hoàng Nam',
        'Thu Hà',
        'Quang Huy',
        'Ngọc Mai'
    ];
    function seed() {
        return {
            accounts: platforms.map((platform, i) => ({
                id: `acc-${i + 1}`,
                name: accountNames[i],
                platform,
                email: ['linh', 'minh', 'nam', 'ha', 'huy', 'mai'][i] + '@omni.studio',
                status: i === 4 ? 'Cần kết nối lại' : 'Hoạt động',
                owner: i < 3 ? 'Linh Nguyễn' : 'Minh Anh',
                created: '2026-10-01'
            })),
            channels: platforms.map((platform, i) => ({
                id: `ch-${i + 1}`,
                name: [
                    'Omni Studio',
                    'omni.lifestyle',
                    'Omni · Website',
                    'omni.creative',
                    'Omni Stories',
                    'Omni Official'
                ][i],
                platform,
                status: i === 4 ? 'Cần kết nối lại' : 'Đã kết nối',
                followers: [28450, 18200, 12560, 34800, 6200, 8400][i],
                owner: accountNames[i],
                url: [
                    'https://facebook.com',
                    'https://instagram.com',
                    'https://example.com',
                    'https://tiktok.com',
                    'https://youtube.com',
                    'https://zalo.me'
                ][i]
            })),
            campaigns: [
                {
                    id: 'cp-1',
                    name: 'Chạm mùa thu',
                    platform: 'Facebook',
                    status: 'Đang chạy',
                    budget: 25000000,
                    spent: 18200000,
                    reach: 128450,
                    leads: 324,
                    start: '2026-10-01',
                    end: '2026-10-31',
                    owner: 'Linh Nguyễn'
                },
                {
                    id: 'cp-2',
                    name: 'Everyday, a little better',
                    platform: 'Instagram',
                    status: 'Đang chạy',
                    budget: 18000000,
                    spent: 12450000,
                    reach: 86400,
                    leads: 218,
                    start: '2026-10-03',
                    end: '2026-10-28',
                    owner: 'Minh Anh'
                },
                {
                    id: 'cp-3',
                    name: 'Brand stories · Q4',
                    platform: 'TikTok',
                    status: 'Đang chạy',
                    budget: 15000000,
                    spent: 8300000,
                    reach: 164200,
                    leads: 156,
                    start: '2026-10-05',
                    end: '2026-10-30',
                    owner: 'Hoàng Nam'
                },
                {
                    id: 'cp-4',
                    name: 'Khám phá bộ sưu tập mới',
                    platform: 'Google',
                    status: 'Tạm dừng',
                    budget: 22000000,
                    spent: 15200000,
                    reach: 98500,
                    leads: 286,
                    start: '2026-10-01',
                    end: '2026-10-25',
                    owner: 'Thu Hà'
                },
                {
                    id: 'cp-5',
                    name: 'Cộng đồng sáng tạo',
                    platform: 'Zalo',
                    status: 'Bản nháp',
                    budget: 8000000,
                    spent: 0,
                    reach: 0,
                    leads: 0,
                    start: '2026-10-15',
                    end: '2026-11-10',
                    owner: 'Ngọc Mai'
                }
            ],
            posts: [
                {
                    id: 'post-1',
                    name: 'Một chút cảm hứng cho ngày mới',
                    content:
                        'Những điều nhỏ bé làm nên một ngày thật đẹp. ☀️\n\nDành một chút thời gian cho chính mình, một tách cà phê và một ý tưởng mới.\n\n#OmniStudio #EverydayInspiration',
                    platform: 'Instagram',
                    channels: ['Instagram', 'Facebook'],
                    status: 'Đã lên lịch',
                    date: '2026-10-12',
                    time: '09:00',
                    campaign: 'Chạm mùa thu',
                    engagement: 0,
                    reach: 0,
                    comments: []
                },
                {
                    id: 'post-2',
                    name: 'Chạm mùa thu — bộ sưu tập mới',
                    content:
                        'Mùa thu không chỉ là một mùa. Đó là cảm giác. 🍂\nKhám phá những câu chuyện mới cùng Omni Studio.',
                    platform: 'Facebook',
                    channels: ['Facebook'],
                    status: 'Đã đăng',
                    date: '2026-10-09',
                    time: '10:00',
                    campaign: 'Chạm mùa thu',
                    engagement: 1248,
                    reach: 28450,
                    comments: []
                },
                {
                    id: 'post-3',
                    name: 'Behind the scenes: Creative days',
                    content:
                        'Một ngày ở studio: ý tưởng, màu sắc và những người bạn. Cùng khám phá hậu trường của chúng mình nhé!',
                    platform: 'TikTok',
                    channels: ['TikTok'],
                    status: 'Đã lên lịch',
                    date: '2026-10-13',
                    time: '14:00',
                    campaign: 'Brand stories · Q4',
                    engagement: 0,
                    reach: 0,
                    comments: []
                },
                {
                    id: 'post-4',
                    name: '5 cách bắt đầu ngày mới tích cực',
                    content:
                        'Bắt đầu từ những điều đơn giản. Viết ra một mục tiêu, lắng nghe một bài nhạc và mở lòng với ngày mới. 🌿',
                    platform: 'Instagram',
                    channels: ['Instagram'],
                    status: 'Chờ duyệt',
                    date: '2026-10-14',
                    time: '09:30',
                    campaign: 'Everyday, a little better',
                    engagement: 0,
                    reach: 0,
                    comments: []
                },
                {
                    id: 'post-5',
                    name: 'Câu chuyện của những người sáng tạo',
                    content:
                        'Mỗi ý tưởng đều bắt đầu từ một câu hỏi. Điều gì truyền cảm hứng cho bạn hôm nay?',
                    platform: 'Facebook',
                    channels: ['Facebook', 'Zalo'],
                    status: 'Bản nháp',
                    date: '2026-10-15',
                    time: '11:00',
                    campaign: 'Cộng đồng sáng tạo',
                    engagement: 0,
                    reach: 0,
                    comments: []
                },
                {
                    id: 'post-6',
                    name: 'Những góc nhỏ, những ý tưởng lớn',
                    content:
                        'Không gian sáng tạo của bạn trông như thế nào? Chia sẻ với Omni nhé. ✨',
                    platform: 'Instagram',
                    channels: ['Instagram'],
                    status: 'Đã đăng',
                    date: '2026-10-08',
                    time: '16:00',
                    campaign: 'Everyday, a little better',
                    engagement: 982,
                    reach: 19200,
                    comments: []
                }
            ],
            ads: [
                {
                    id: 'ad-1',
                    name: 'Autumn collection · Carousel',
                    platform: 'Facebook',
                    status: 'Đang chạy',
                    campaign: 'Chạm mùa thu',
                    budget: 500000,
                    spent: 4250000,
                    clicks: 2840,
                    ctr: 3.82
                },
                {
                    id: 'ad-2',
                    name: 'Everyday inspiration · Reels',
                    platform: 'Instagram',
                    status: 'Đang chạy',
                    campaign: 'Everyday, a little better',
                    budget: 350000,
                    spent: 2840000,
                    clicks: 1920,
                    ctr: 4.26
                },
                {
                    id: 'ad-3',
                    name: 'Brand discovery · Search',
                    platform: 'Google',
                    status: 'Tạm dừng',
                    campaign: 'Khám phá bộ sưu tập mới',
                    budget: 450000,
                    spent: 3850000,
                    clicks: 3420,
                    ctr: 5.14
                },
                {
                    id: 'ad-4',
                    name: 'Creative community · Video',
                    platform: 'TikTok',
                    status: 'Đang chạy',
                    campaign: 'Brand stories · Q4',
                    budget: 300000,
                    spent: 1940000,
                    clicks: 1450,
                    ctr: 2.98
                }
            ],
            customers: [
                {
                    id: 'cus-1',
                    name: 'Nguyễn Phương Anh',
                    email: 'phuonganh@example.com',
                    platform: 'Facebook',
                    visits: 12,
                    lead: 'Tiềm năng',
                    last: '2026-10-10',
                    source: 'Chạm mùa thu'
                },
                {
                    id: 'cus-2',
                    name: 'Trần Minh Đức',
                    email: 'minhduc@example.com',
                    platform: 'Google',
                    visits: 8,
                    lead: 'Đã chuyển đổi',
                    last: '2026-10-09',
                    source: 'Brand discovery'
                },
                {
                    id: 'cus-3',
                    name: 'Lê Khánh Linh',
                    email: 'khanhlinh@example.com',
                    platform: 'Instagram',
                    visits: 6,
                    lead: 'Mới',
                    last: '2026-10-10',
                    source: 'Everyday inspiration'
                },
                {
                    id: 'cus-4',
                    name: 'Phạm Hoàng An',
                    email: 'hoangan@example.com',
                    platform: 'TikTok',
                    visits: 15,
                    lead: 'Tiềm năng',
                    last: '2026-10-08',
                    source: 'Brand stories'
                },
                {
                    id: 'cus-5',
                    name: 'Đỗ Ngọc Hà',
                    email: 'ngocha@example.com',
                    platform: 'Zalo',
                    visits: 3,
                    lead: 'Mới',
                    last: '2026-10-09',
                    source: 'Cộng đồng sáng tạo'
                }
            ],
            keywords: [
                {
                    id: 'kw-1',
                    name: 'tiếp thị đa kênh',
                    url: 'omni.studio/marketing',
                    platform: 'Google',
                    rank: 3,
                    previous: 7,
                    volume: 12400,
                    status: 'Top 10'
                },
                {
                    id: 'kw-2',
                    name: 'quản lý chiến dịch marketing',
                    url: 'omni.studio/campaigns',
                    platform: 'Google',
                    rank: 5,
                    previous: 8,
                    volume: 8100,
                    status: 'Top 10'
                },
                {
                    id: 'kw-3',
                    name: 'lịch đăng bài mạng xã hội',
                    url: 'omni.studio/calendar',
                    platform: 'Google',
                    rank: 8,
                    previous: 6,
                    volume: 6600,
                    status: 'Top 10'
                },
                {
                    id: 'kw-4',
                    name: 'marketing automation',
                    url: 'omni.studio/automation',
                    platform: 'Google',
                    rank: 12,
                    previous: 18,
                    volume: 14800,
                    status: 'Top 20'
                },
                {
                    id: 'kw-5',
                    name: 'phân tích hiệu suất nội dung',
                    url: 'omni.studio/analytics',
                    platform: 'Google',
                    rank: 16,
                    previous: 16,
                    volume: 3200,
                    status: 'Top 20'
                }
            ],
            competitors: [
                {
                    id: 'co-1',
                    name: 'Creative House',
                    url: 'creativehouse.example',
                    platform: 'Google',
                    traffic: 84200,
                    keywords: 1240,
                    score: 72,
                    status: 'Đang theo dõi'
                },
                {
                    id: 'co-2',
                    name: 'Bloom Agency',
                    url: 'bloom.example',
                    platform: 'Google',
                    traffic: 62400,
                    keywords: 980,
                    score: 65,
                    status: 'Đang theo dõi'
                },
                {
                    id: 'co-3',
                    name: 'The Social Club',
                    url: 'socialclub.example',
                    platform: 'Google',
                    traffic: 48600,
                    keywords: 860,
                    score: 61,
                    status: 'Đang theo dõi'
                }
            ],
            conversations: [
                {
                    id: 'msg-1',
                    name: 'Nguyễn Phương Anh',
                    platform: 'Facebook',
                    status: 'Chưa xử lý',
                    time: '10:42',
                    messages: [
                        {
                            from: 'customer',
                            text: 'Chào bạn, mình muốn tìm hiểu thêm về bộ sưu tập mùa thu của studio ạ.',
                            time: '10:40'
                        },
                        {
                            from: 'agent',
                            text: 'Chào Phương Anh! Cảm ơn bạn đã quan tâm. Bạn đang tìm sản phẩm hay muốn hợp tác cùng studio?',
                            time: '10:41'
                        },
                        {
                            from: 'customer',
                            text: 'Mình muốn nhận catalogue và thông tin các sản phẩm mới nhé 🌿',
                            time: '10:42'
                        }
                    ]
                },
                {
                    id: 'msg-2',
                    name: 'Trần Minh Đức',
                    platform: 'Zalo',
                    status: 'Chưa xử lý',
                    time: '10:28',
                    messages: [
                        {
                            from: 'customer',
                            text: 'Cho mình hỏi studio có hỗ trợ tư vấn chiến dịch không?',
                            time: '10:28'
                        }
                    ]
                },
                {
                    id: 'msg-3',
                    name: 'Lê Khánh Linh',
                    platform: 'Instagram',
                    status: 'Đã xử lý',
                    time: '09:56',
                    messages: [
                        {
                            from: 'customer',
                            text: 'Cảm ơn team đã tư vấn nhiệt tình!',
                            time: '09:56'
                        }
                    ]
                },
                {
                    id: 'msg-4',
                    name: 'Phạm Hoàng An',
                    platform: 'Facebook',
                    status: 'Chưa xử lý',
                    time: '09:31',
                    messages: [
                        {
                            from: 'customer',
                            text: 'Mình có thể đặt lịch trao đổi vào chiều nay không?',
                            time: '09:31'
                        }
                    ]
                }
            ],
            rankChecks: []
        };
    }
    function escape(value) {
        return String(value ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function filterRows(rows, search = '', platform = '', status = '') {
        const query = search.toLocaleLowerCase('vi');
        return rows.filter(
            (row) =>
                (!platform || row.platform === platform || row.channels?.includes(platform)) &&
                (!status || row.status === status || row.lead === status) &&
                Object.values(row).some((value) =>
                    String(value).toLocaleLowerCase('vi').includes(query)
                )
        );
    }
    function csv(rows, columns) {
        const cell = (value) =>
            '"' +
            String(value ?? '')
                .replace(/^[=+@-]/, "'$&")
                .replace(/"/g, '""') +
            '"';
        return (
            '\uFEFF' +
            [
                columns.map((c) => cell(c.label)).join(','),
                ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(','))
            ].join('\r\n')
        );
    }
    function validatePost(post) {
        if (!post.name?.trim() || !post.content?.trim())
            return 'Nhập tiêu đề và nội dung bài viết.';
        if (!post.channels?.length) return 'Chọn ít nhất một kênh đăng.';
        const limits = {
            Facebook: 63206,
            Instagram: 2200,
            TikTok: 4000,
            YouTube: 5000,
            Zalo: 2000,
            Google: 1500
        };
        const over = post.channels.find((channel) => post.content.length > limits[channel]);
        if (over) return `Nội dung vượt giới hạn ${limits[over]} ký tự của ${over}.`;
        if (post.status === 'Đã lên lịch' && (!post.date || !post.time))
            return 'Chọn ngày và giờ đăng.';
        if (
            post.status === 'Đã lên lịch' &&
            new Date(`${post.date}T${post.time}:00+07:00`).getTime() <= Date.now()
        )
            return 'Thời gian đăng phải ở tương lai (UTC+7).';
        return '';
    }
    function save(storage, state) {
        storage.setItem(key, JSON.stringify(state));
    }
    function load(storage) {
        const raw = storage.getItem(key);
        if (!raw) return seed();
        const state = JSON.parse(raw);
        if (!validWorkspace(state)) throw new Error('Dữ liệu đã lưu không hợp lệ.');
        return state;
    }
    function validWorkspace(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        const types = {
            accounts: { strings: ['email', 'owner', 'status', 'created'] },
            channels: { strings: ['url', 'owner', 'status'], numbers: ['followers'] },
            campaigns: {
                strings: ['owner', 'status', 'start', 'end'],
                numbers: ['budget', 'spent', 'reach', 'leads']
            },
            posts: {
                strings: ['content', 'status', 'date', 'time', 'campaign'],
                numbers: ['engagement', 'reach']
            },
            ads: { strings: ['campaign', 'status'], numbers: ['budget', 'spent', 'clicks', 'ctr'] },
            customers: { strings: ['email', 'lead', 'last', 'source'], numbers: ['visits'] },
            keywords: { strings: ['url'], numbers: ['rank', 'previous', 'volume'] },
            competitors: { strings: ['url', 'status'], numbers: ['traffic', 'keywords', 'score'] },
            conversations: { strings: ['time', 'status'] },
            rankChecks: { strings: ['url', 'region', 'date', 'status'], numbers: ['rank'] }
        };
        if (Object.keys(data).length !== Object.keys(types).length) return false;
        return Object.entries(types).every(
            ([key, rules]) =>
                Array.isArray(data[key]) &&
                data[key].length <= 1000 &&
                new Set(data[key].map((r) => r?.id)).size === data[key].length &&
                data[key].every((row) => {
                    if (
                        !row ||
                        typeof row.id !== 'string' ||
                        !row.id ||
                        row.id.length > 100 ||
                        typeof row.name !== 'string' ||
                        !row.name.trim() ||
                        row.name.length > 180 ||
                        !platforms.includes(row.platform)
                    )
                        return false;
                    if (
                        !rules.strings.every((field) => typeof row[field] === 'string') ||
                        !(rules.numbers || []).every(
                            (field) => Number.isFinite(row[field]) && row[field] >= 0
                        )
                    )
                        return false;
                    if (
                        key === 'posts' &&
                        (!Array.isArray(row.channels) ||
                            !row.channels.length ||
                            !row.channels.every((c) => platforms.includes(c)) ||
                            !Array.isArray(row.comments) ||
                            !row.comments.every(
                                (c) =>
                                    c && typeof c.text === 'string' && typeof c.delay === 'string'
                            ) ||
                            (row.image &&
                                !/^data:image\/(jpeg|png|webp|gif);base64,/.test(row.image)))
                    )
                        return false;
                    if (
                        key === 'conversations' &&
                        (!Array.isArray(row.messages) ||
                            !row.messages.every(
                                (m) =>
                                    m &&
                                    ['agent', 'customer'].includes(m.from) &&
                                    typeof m.text === 'string' &&
                                    typeof m.time === 'string'
                            ))
                    )
                        return false;
                    return true;
                })
        );
    }
    const api = {
        key,
        today,
        platforms,
        seed,
        escape,
        filterRows,
        csv,
        validatePost,
        validWorkspace,
        save,
        load
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Omni = api;
})(typeof window !== 'undefined' ? window : globalThis);
