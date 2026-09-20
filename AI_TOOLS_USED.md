# AI Tools Used

**Claude (Anthropic)** was used for the entire build, in one continuous session:
- Reading and structuring the Data Pack (10 KB articles, Asset Management Policy,
  15 employee requests, 10 seed tickets) into the app's data model.
- Designing the decision engine: classification categories, per-category rules,
  the escalation-routing table, and specifically the handling of the two
  intentional "trap" cases in the data pack — the KB-03 / Asset Management Policy
  conflict (REQ-01) and the admin-access request with no governing policy (REQ-10).
- Writing all application code (`index.html`, `data.js`, `agent.js`, `app.js`).
- Self-testing: running the decision engine in Node against all 15 sample requests
  to catch misclassifications before shipping (this caught and fixed two real bugs —
  a guest-Wi-Fi phrasing miss and an expense-tool request being misread as a plain
  password issue), and rendering the page with a headless browser to check layout,
  dark mode, mobile breakpoints, and the multi-turn follow-up flow.
- Writing this documentation set (`ARCHITECTURE.md`, `ASSUMPTIONS.md`, this file).

No other AI tool, code generator, or external API was used. The shipped prototype
itself calls no AI model at runtime — it's a deterministic rule engine over the data
pack (see `ARCHITECTURE.md` §1 for why, and §4 for where an LLM would be added in a
production version).
