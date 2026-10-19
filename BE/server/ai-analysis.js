const express = require('express');
const crypto = require('node:crypto');
const { audit } = require('./data-store');
const { AiInputError, validateImport, calculate } = require('./ai-metrics');
const {
    FREE_TIER_MODEL,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    AiProviderError,
    payloadFor,
    validateReport,
    createGeminiProvider
} = require('./ai-provider');

const uuid = () => crypto.randomUUID();
const fail = (message, status = 400) => new AiInputError(message, status);
const isUuid = (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function publicImport(row) {
    const data = row.snapshot;
    return {
        id: row.id,
        pageId: data.pageId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        timezone: data.timezone,
        source: data.source,
        sourceLabel: data.sourceLabel,
        importedAt: row.imported_at,
        rowCount: data.rows.length,
        metricDefinitionVersion: data.metricDefinitionVersion,
        rows: data.rows
    };
}

function importBody(row) {
    const calculated = calculate(row.snapshot);
    return {
        import: publicImport(row),
        ...calculated,
        aiPayload: payloadFor(row.snapshot, calculated, false),
        aiPayloadWithText: payloadFor(row.snapshot, calculated, true)
    };
}

function publicRun(row) {
    return {
        id: row.id,
        importId: row.batch_id,
        pageId: row.page_id,
        periodStart:
            row.period_start instanceof Date
                ? row.period_start.toISOString().slice(0, 10)
                : row.period_start,
        periodEnd:
            row.period_end instanceof Date
                ? row.period_end.toISOString().slice(0, 10)
                : row.period_end,
        status: row.status,
        model: row.model,
        promptVersion: row.prompt_version,
        schemaVersion: row.schema_version,
        inputHash: row.input_hash,
        inputSnapshot: row.input_snapshot,
        kpis: row.kpis,
        facts: row.facts,
        limitations: row.limitations,
        report: row.report,
        usage: row.usage,
        estimatedCostVnd: Number(row.estimated_cost_vnd),
        actualCostVnd: row.actual_cost_vnd == null ? null : Number(row.actual_cost_vnd),
        error: row.error_text,
        createdAt: row.created_at,
        finishedAt: row.finished_at
    };
}

function limits(env) {
    const freeTierOnly = env.AI_GEMINI_FREE_TIER_ONLY !== 'false';
    const daily = Number(env.AI_DAILY_REQUEST_LIMIT || 10);
    const maxOutput = Number(env.AI_MAX_OUTPUT_TOKENS || 1200);
    const maxInput = Number(env.AI_MAX_INPUT_TOKENS || 200000);
    const budget = Number(env.AI_DAILY_BUDGET_VND);
    const inputPrice = Number(env.AI_INPUT_PRICE_VND_PER_MILLION_TOKENS);
    const outputPrice = Number(env.AI_OUTPUT_PRICE_VND_PER_MILLION_TOKENS);
    return {
        freeTierOnly,
        daily: Number.isInteger(daily) && daily > 0 ? Math.min(daily, 100) : 10,
        maxOutput: Number.isInteger(maxOutput) && maxOutput > 0 ? Math.min(maxOutput, 3000) : 1200,
        maxInput: Number.isInteger(maxInput) && maxInput > 0 ? Math.min(maxInput, 200000) : 200000,
        budget,
        inputPrice,
        outputPrice,
        budgetConfigured:
            !freeTierOnly &&
            Number.isFinite(budget) &&
            budget > 0 &&
            Number.isFinite(inputPrice) &&
            inputPrice > 0 &&
            Number.isFinite(outputPrice) &&
            outputPrice > 0
    };
}

function estimateCost(settings) {
    if (settings.freeTierOnly) return 0;
    return (
        (settings.maxInput * settings.inputPrice + settings.maxOutput * settings.outputPrice) /
        1000000
    );
}

function actualCostFor(usage, settings) {
    if (settings.freeTierOnly) return null;
    return usage?.inputTokens != null && usage?.outputTokens != null
        ? (usage.inputTokens * settings.inputPrice +
              (usage.outputTokens + (usage.thoughtsTokens || 0)) * settings.outputPrice) /
              1000000
        : null;
}

async function expireInterrupted(db) {
    await db.query(
        `UPDATE ai_analysis_runs SET status='failed',error_text='Yêu cầu trước bị gián đoạn.',finished_at=now()
         WHERE workspace_id=1 AND status='reserved' AND created_at<now()-interval '2 minutes'`
    );
}

async function dailyUsage(db) {
    const result = await db.query(
        `SELECT count(*)::int AS calls,
                coalesce(sum(coalesce(actual_cost_vnd,estimated_cost_vnd)),0)::text AS reserved_cost
         FROM ai_analysis_runs
         WHERE workspace_id=1 AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`
    );
    return { calls: result.rows[0].calls, cost: Number(result.rows[0].reserved_cost) };
}

function aiAnalysisRouter(pool, { provider = createGeminiProvider(), env = process.env } = {}) {
    const router = express.Router();
    const settings = limits(env);
    const providerConfigured = Boolean(
        provider.configured && (!settings.freeTierOnly || provider.model === FREE_TIER_MODEL)
    );
    const handle = (fn) => async (req, res) => {
        try {
            if (!pool) throw fail('Cần PostgreSQL và migration 012 để dùng AI Analysis.', 503);
            await fn(req, res);
        } catch (error) {
            const known = error instanceof AiInputError || error instanceof AiProviderError;
            const status = known ? error.status : error.code === '42P01' ? 503 : 503;
            const message = known
                ? error.message
                : error.code === '42P01'
                  ? 'Chưa có bảng AI Analysis. Chạy npm run db:migrate.'
                  : 'Không thể truy cập dữ liệu AI Analysis.';
            res.status(status).json({ error: message });
        }
    };

    router.get('/status', async (req, res) => {
        try {
            if (!pool)
                return res.json({
                    ready: false,
                    providerConfigured: false,
                    freeTierOnly: settings.freeTierOnly,
                    model: provider.model || '',
                    error: 'Cần PostgreSQL.'
                });
            await expireInterrupted(pool);
            const daily = await dailyUsage(pool);
            res.json({
                ready: true,
                providerConfigured,
                freeTierOnly: settings.freeTierOnly,
                budgetConfigured: settings.budgetConfigured,
                model: provider.model || '',
                limitPerDay: settings.daily,
                remainingToday: Math.max(0, settings.daily - daily.calls),
                remainingBudgetVnd:
                    !settings.freeTierOnly && settings.budgetConfigured
                        ? Math.max(0, settings.budget - daily.cost)
                        : null
            });
        } catch {
            res.json({
                ready: false,
                providerConfigured,
                freeTierOnly: settings.freeTierOnly,
                model: provider.model || '',
                error: 'Cần migration 012 và PostgreSQL.'
            });
        }
    });

    router.post(
        '/imports',
        handle(async (req, res) => {
            if (!['admin', 'manager'].includes(req.actor?.role))
                throw fail('Chỉ Admin/Manager được nhập số liệu AI.', 403);
            const data = validateImport(req.body);
            const client = await pool.connect();
            let saved;
            try {
                await client.query('BEGIN');
                // Serialize overlapping-period checks across imports, including other app instances.
                await client.query('SELECT pg_advisory_xact_lock(120012,1)');
                for (const row of data.rows) {
                    const overlap = await client.query(
                        `SELECT 1 FROM ai_import_rows WHERE workspace_id=1 AND page_id=$1 AND provider_post_id=$2
                     AND period_start<=$4::date AND period_end>=$3::date LIMIT 1`,
                        [data.pageId, row.providerPostId, row.periodStart, row.periodEnd]
                    );
                    if (overlap.rowCount)
                        throw fail('Bài viết đã có số liệu trùng hoặc chồng kỳ.', 409);
                }
                const id = uuid();
                const result = await client.query(
                    `INSERT INTO ai_import_batches(id,workspace_id,actor_id,page_id,period_start,period_end,timezone,source,source_label,metric_definition_version,snapshot)
                 VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
                    [
                        id,
                        req.actor.id,
                        data.pageId,
                        data.periodStart,
                        data.periodEnd,
                        data.timezone,
                        data.source,
                        data.sourceLabel,
                        data.metricDefinitionVersion,
                        JSON.stringify(data)
                    ]
                );
                for (const row of data.rows)
                    await client.query(
                        `INSERT INTO ai_import_rows(batch_id,workspace_id,page_id,provider_post_id,period_start,period_end,timezone,reach,impressions,interactions,link_clicks,post_text)
                     VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                        [
                            id,
                            data.pageId,
                            row.providerPostId,
                            row.periodStart,
                            row.periodEnd,
                            row.timezone,
                            row.reach,
                            row.impressions,
                            row.interactions,
                            row.linkClicks,
                            row.text
                        ]
                    );
                await audit(client, req.actor, 'ai.import', 'ai_import_batches', id, null, {
                    pageId: data.pageId,
                    rowCount: data.rows.length,
                    source: data.source
                });
                await client.query('COMMIT');
                saved = result.rows[0];
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            res.status(201).json(importBody(saved));
        })
    );

    router.get(
        '/imports/:id',
        handle(async (req, res) => {
            if (!isUuid(req.params.id)) throw fail('Import ID không hợp lệ.');
            const result = await pool.query(
                'SELECT * FROM ai_import_batches WHERE workspace_id=1 AND id=$1',
                [req.params.id]
            );
            if (!result.rowCount) throw fail('Không tìm thấy dữ liệu nhập.', 404);
            res.json(importBody(result.rows[0]));
        })
    );

    router.post(
        '/analyses',
        handle(async (req, res) => {
            if (!['admin', 'manager'].includes(req.actor?.role))
                throw fail('Chỉ Admin/Manager được yêu cầu AI.', 403);
            if (!isUuid(req.body?.importId) || typeof req.body.includeText !== 'boolean')
                throw fail('Cần importId và lựa chọn includeText rõ ràng.');
            const imported = await pool.query(
                'SELECT * FROM ai_import_batches WHERE workspace_id=1 AND id=$1',
                [req.body.importId]
            );
            if (!imported.rowCount) throw fail('Không tìm thấy dữ liệu nhập.', 404);
            const data = imported.rows[0].snapshot;
            const calculated = calculate(data);
            if (!calculated.facts.some((fact) => fact.value !== null))
                throw fail(
                    'Chưa có chỉ số cùng kỳ để AI phân tích. KPI thiếu dữ liệu vẫn xem được.',
                    422
                );
            const payload = payloadFor(data, calculated, req.body.includeText);
            // UTF-8 bytes plus prompt allowance conservatively upper-bound practical token count.
            const inputTokens = Buffer.byteLength(JSON.stringify(payload), 'utf8') + 1000;
            if (inputTokens > settings.maxInput)
                throw fail('Dữ liệu vượt giới hạn đầu vào AI.', 413);
            const inputHash = hash({
                importId: req.body.importId,
                pageId: data.pageId,
                payload,
                model: provider.model,
                prompt: PROMPT_VERSION,
                schema: SCHEMA_VERSION
            });
            const client = await pool.connect();
            let run;
            try {
                await client.query('BEGIN');
                await client.query('SELECT pg_advisory_xact_lock(120012,2)');
                const cached = await client.query(
                    `SELECT * FROM ai_analysis_runs WHERE workspace_id=1 AND input_hash=$1 AND status='completed' ORDER BY created_at DESC LIMIT 1`,
                    [inputHash]
                );
                if (cached.rowCount) {
                    await client.query('COMMIT');
                    return res.json({ analysis: publicRun(cached.rows[0]), cached: true });
                }
                await client.query(
                    `UPDATE ai_analysis_runs SET status='failed',error_text='Yêu cầu trước bị gián đoạn.',finished_at=now()
                 WHERE workspace_id=1 AND input_hash=$1 AND status='reserved' AND created_at<now()-interval '2 minutes'`,
                    [inputHash]
                );
                const pending = await client.query(
                    "SELECT 1 FROM ai_analysis_runs WHERE workspace_id=1 AND input_hash=$1 AND status='reserved' LIMIT 1",
                    [inputHash]
                );
                if (pending.rowCount) throw fail('Phân tích cùng dữ liệu đang chạy.', 409);
                if (!providerConfigured)
                    throw fail(
                        settings.freeTierOnly && provider.model !== FREE_TIER_MODEL
                            ? `Chế độ miễn phí chỉ cho phép ${FREE_TIER_MODEL}.`
                            : 'Dịch vụ AI chưa được cấu hình.',
                        503
                    );
                if (!settings.freeTierOnly && !settings.budgetConfigured)
                    throw fail('Chưa cấu hình trần ngân sách và đơn giá AI đã kiểm chứng.', 503);
                const usage = await dailyUsage(client);
                if (usage.calls >= settings.daily) throw fail('Đã đạt hạn mức AI hôm nay.', 429);
                const estimatedCost = estimateCost(settings);
                if (!settings.freeTierOnly && usage.cost + estimatedCost > settings.budget)
                    throw fail('Không đủ ngân sách AI còn lại hôm nay.', 429);
                const id = uuid();
                const result = await client.query(
                    `INSERT INTO ai_analysis_runs(id,workspace_id,batch_id,actor_id,page_id,period_start,period_end,input_hash,input_snapshot,kpis,facts,limitations,model,prompt_version,schema_version,status,estimated_cost_vnd)
                 VALUES($1,1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,$14,'reserved',$15) RETURNING *`,
                    [
                        id,
                        req.body.importId,
                        req.actor.id,
                        data.pageId,
                        data.periodStart,
                        data.periodEnd,
                        inputHash,
                        JSON.stringify(payload),
                        JSON.stringify(calculated.kpis),
                        JSON.stringify(calculated.facts),
                        JSON.stringify(calculated.limitations),
                        provider.model,
                        PROMPT_VERSION,
                        SCHEMA_VERSION,
                        estimatedCost
                    ]
                );
                await audit(
                    client,
                    req.actor,
                    'ai.analysis.request',
                    'ai_analysis_runs',
                    id,
                    null,
                    { importId: req.body.importId, includeText: req.body.includeText }
                );
                await client.query('COMMIT');
                run = result.rows[0];
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            let result;
            try {
                result = await provider.generate(payload);
                result.report = validateReport(result.report, calculated.facts);
            } catch (error) {
                const safeError =
                    error instanceof AiProviderError
                        ? error
                        : new AiProviderError('Dịch vụ AI thất bại.');
                const failedUsage = safeError.usage || result?.usage || null;
                const failed = await pool.query(
                    `UPDATE ai_analysis_runs SET status='failed',error_text=$2,usage=$3::jsonb,actual_cost_vnd=$4,finished_at=now()
                 WHERE id=$1 RETURNING *`,
                    [
                        run.id,
                        safeError.message,
                        failedUsage ? JSON.stringify(failedUsage) : null,
                        actualCostFor(failedUsage, settings)
                    ]
                );
                return res
                    .status(safeError.status)
                    .json({ error: safeError.message, analysis: publicRun(failed.rows[0]) });
            }
            const actualCost = actualCostFor(result.usage, settings);
            const completed = await pool.query(
                `UPDATE ai_analysis_runs SET status='completed',report=$2::jsonb,usage=$3::jsonb,actual_cost_vnd=$4,finished_at=now()
             WHERE id=$1 RETURNING *`,
                [
                    run.id,
                    JSON.stringify(result.report),
                    result.usage ? JSON.stringify(result.usage) : null,
                    actualCost
                ]
            );
            res.status(201).json({ analysis: publicRun(completed.rows[0]), cached: false });
        })
    );

    router.get(
        '/analyses',
        handle(async (req, res) => {
            await expireInterrupted(pool);
            const limit = Number(req.query.limit || 20);
            const offset = Number(req.query.offset || 0);
            if (
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 100 ||
                !Number.isInteger(offset) ||
                offset < 0
            )
                throw fail('Phân trang không hợp lệ.');
            const [items, count] = await Promise.all([
                pool.query(
                    'SELECT * FROM ai_analysis_runs WHERE workspace_id=1 ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2',
                    [limit, offset]
                ),
                pool.query(
                    'SELECT count(*)::int AS total FROM ai_analysis_runs WHERE workspace_id=1'
                )
            ]);
            res.json({ items: items.rows.map(publicRun), total: count.rows[0].total });
        })
    );

    router.get(
        '/analyses/:id',
        handle(async (req, res) => {
            if (!isUuid(req.params.id)) throw fail('Analysis ID không hợp lệ.');
            const result = await pool.query(
                'SELECT * FROM ai_analysis_runs WHERE workspace_id=1 AND id=$1',
                [req.params.id]
            );
            if (!result.rowCount) throw fail('Không tìm thấy báo cáo.', 404);
            res.json({ analysis: publicRun(result.rows[0]) });
        })
    );
    return router;
}

module.exports = { aiAnalysisRouter, limits, publicRun, importBody };
