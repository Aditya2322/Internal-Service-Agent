# Architecture & Process Flow — Veridian IT Service Desk Agent

## 1. System architecture

The prototype is intentionally a single self-contained client-side app: no backend,
no database, no API keys to configure. Everything an evaluator needs is inlined into
one HTML file, so it runs from a double-click or a static link with zero setup.

```mermaid
flowchart LR
    subgraph Browser["Browser (single HTML file)"]
        UI["Chat UI\n(chips + free-text input)"]
        ENGINE["Decision Engine\n(classify → decide → cite)"]
        STORE["Ticket Store\n(session tickets + seed queue)"]
        KBV["Knowledge Base viewer"]
        LS[("localStorage\nper-visitor session only")]
    end
    EMP["Employee message"] --> UI
    UI --> ENGINE
    ENGINE -->|reads| KBDATA["Data Pack\nKB-01..KB-10, Asset Policy,\nseed tickets, sample requests"]
    ENGINE --> STORE
    STORE --> UI
    STORE <---> LS
    KBDATA --> KBV
```

**Why no backend / no LLM API for this build:** the reviewer needs to open a link and
try it immediately, with no server to host and no API key to supply. A rule-based
engine grounded strictly in the data pack also makes every decision *reproducible and
auditable* — the same input always produces the same policy citation, which matters
for something with escalation/compliance stakes. Section 4 below (and
`AI_TOOLS_USED.md`) describes where an LLM layer would sit in a production version.

## 2. Process flow (per message)

```mermaid
flowchart TD
    A["Employee message"] --> B{"Awaiting an answer\nto a prior follow-up?"}
    B -- yes --> C["Interpret answer\nin context of that follow-up"]
    B -- no --> D{"Message is vague /\nunclassifiable?"}
    D -- yes --> E["Ask employee to clarify\n(no policy invented)"]
    D -- no --> F["Classify against 10 KB\ncategories (keyword match,\nsecurity always checked first)"]
    F --> G{"Missing a required detail?\n(age, contractor vs FTE,\ncatalog status, remote days,\nverified fault)"}
    G -- yes --> H["Ask one targeted\nfollow-up question"]
    G -- no --> I["Apply the matching policy"]
    C --> I
    I --> J{"Do two policies conflict,\nor does no policy apply?"}
    J -- conflict --> K["Say so explicitly,\ncite both, route for\nhuman sign-off"]
    J -- no policy --> L["Say so explicitly,\ncheck ticket precedent,\nroute for approval"]
    J -- clean match --> M{"Resolvable by policy\nalone (self-service)?"}
    M -- yes --> N["Resolve directly,\ncite the KB id"]
    M -- no --> O["Escalate to the right\nparty (IT / Security /\nFinance / Manager)"]
    H --> P["Open/keep ticket as\nPending Info, log turn"]
    K --> Q["Create/update ticket,\nfull audit trail"]
    L --> Q
    N --> Q
    O --> Q
    E --> P
```

## 3. Escalation routing

| Situation | Routed to |
|---|---|
| 5+ failed logins | IT (manual unlock) |
| Contractor needing VPN | Manager (approval form) |
| Non-catalog software | IT Security (3–5 business days) |
| Laptop failure inside the 4-yr asset cycle | IT (verify fault) **+** Finance (sign-off) |
| WFH equipment, >3 days/week | Manager (sign-off) → Finance (processing) → IT (shipping only) |
| Mailbox over quota, needs >25GB | Manager (approval, capped 50GB) |
| Suspected phishing/malware | Security (immediate, no ticket delay) |
| Admin/privileged server access | System owner (no self-service policy exists — precedent: TK-1050 rejected) |
| Expense tool — no account yet | Finance |
| Expense tool — existing account, login error | IT |

## 4. Where this would gain an LLM layer in production

The keyword classifier is deliberately conservative and auditable, but it's brittle
against phrasing the data pack didn't anticipate. A production version would keep the
**same decision engine and policy rules as the source of truth**, and add an LLM
(Claude, via the Anthropic API) at two points only:
1. **Intent understanding** — replace/augment keyword classification with an LLM call
   constrained to return one of the 10 KB ids (or "none"), so odd phrasing still
   routes correctly, while the actual policy logic stays deterministic.
2. **Response phrasing** — have the LLM turn the engine's structured decision
   (category, citation, escalation target) into natural language, instead of the
   fixed templates used here.
Both keep the LLM out of the *decision* itself, which is the part that needs to be
consistent, citable, and safe to audit.
