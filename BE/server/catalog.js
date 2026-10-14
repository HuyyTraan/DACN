// Static SQL identifiers only. Request input never becomes a table name.
const collections = {
    accounts: 'studio_accounts',
    channels: 'studio_channels',
    campaigns: 'studio_campaigns',
    posts: 'studio_posts',
    ads: 'studio_ads',
    customers: 'studio_customers',
    keywords: 'studio_keywords',
    competitors: 'studio_competitors',
    conversations: 'studio_conversations',
    rankChecks: 'studio_rank_checks'
};
const resources = {
    workflows: 'studio_workflows',
    workflowRuns: 'studio_workflow_runs',
    metrics: 'studio_metrics',
    traffic: 'studio_traffic_events',
    reports: 'studio_reports',
    media: 'studio_media',
    notifications: 'studio_notifications',
    settings: 'studio_settings',
    tags: 'studio_tags',
    approvals: 'studio_approvals',
    socialAccounts: 'studio_social_accounts'
};
module.exports = {
    collections: Object.freeze(Object.assign(Object.create(null), collections)),
    resources: Object.freeze(Object.assign(Object.create(null), resources))
};
