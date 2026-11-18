# Aggregated Telegram release notification

Status: requested integration, not executed or live-delivery verified. The user explicitly requested no tests, builds, type checks or release dry runs after connecting the plugin.

Use pinned dev-only @nuykon/semantic-release-tg-bot 1.0.0. It is not imported by library packages or browser builds. Private workspace/release tooling requires Node >=22.20; public editor package runtime contracts are unchanged.

Do not add Telegram hooks to each package's semantic-release configuration. Instead run one optional notification step after a successful live multirelease and release-state persistence. It invokes the plugin's verifyConditions/success API once with a bounded HTML summary of only the packages actually released, each with its independent version and a link to the source workflow. Escape every interpolated package/version value. Do not include commit text, changelogs, secrets or arbitrary URLs.

Preserve release-plan.json for planning. A separate ignored release-published.json envelope has version=1, sourceSha, runId, runAttempt and packages [{name,version}]. Clear stale reports when release/planning starts. Produce it only after live publication, state persistence and plan writing all succeed, with nonempty actual releases. No-release and dry-run execution leave no live report; partial/failed publication never creates one. sourceSha is the pre-persistence commit and is compared with GITHUB_SHA, not HEAD after the version-sync commit.

The sender runs only in GitHub Actions on refs/heads/main. It requires matching current source SHA, run ID and attempt in a valid bounded report. No report/no releases/no complete Telegram configuration means no network or plugin import. Successful whole-workflow reruns that release nothing therefore send nothing. One invocation is not an exactly-once guarantee after a network timeout or explicit re-execution; there are no delivery retries or remote deduplication claims.

GitHub secrets: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; optional TELEGRAM_BOT_PROXY supports the plugin's HTTP/HTTPS CONNECT transport. Pass only these secrets to the plugin, only in the post-publication step. For private messages the user must first start the bot and provide the numeric private-chat ID; public channel usernames are supported by Telegram. No tokens or authenticated proxy URLs belong in files/logs/chat. Error output is bounded and redacts configured secret values.

The workflow notification step has success-only execution, a two-minute timeout and continue-on-error. Notification failure produces a visible warning without marking already-published npm versions as rolled back or repeating publication. Existing required checks, OIDC permissions and publication concurrency are unchanged; do not widen continue-on-error to the publication step. CI planning and PR jobs have no Telegram credentials and send no messages. No real Telegram send is part of this local integration.
