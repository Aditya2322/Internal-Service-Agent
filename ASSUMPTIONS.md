# Inputs, Sources & Assumptions

## Inputs / sources used
The agent's only ground truth is the Assignment 2 Data Pack (Veridian Corp):
- 10 Knowledge Base articles (KB-01 – KB-10)
- 1 Asset Management Policy extract (Finance & Assets, Q2 2026)
- 15 employee requests (Section 2)
- 10 seed/historical tickets (Section 3), used as precedent and pre-loaded read-only
  into the "Existing queue" list

No policy, threshold, or fact outside this data pack is used. Where the data pack is
silent (e.g. what's actually in the "approved software catalog"), the agent asks the
employee rather than guessing — see the KB-04 follow-up flow.

## Assumptions made explicit
- **Session model:** each browser session is a fresh conversation. The agent does not
  pre-load the *current status* of the 15 employee requests (e.g. that REQ-06's
  printer ticket is already "Investigating") — clicking a sample chip sends only the
  employee's original message, as if the conversation were starting now. This is a
  deliberate simplification for a stateless client-side demo; a production agent would
  read/write against the real ticket system instead of a fresh in-memory session.
- **New tickets start at TK-1052**, continuing the existing queue's numbering (last
  seed ticket is TK-1051).
- **Full-time vs. contractor (KB-02):** if the message doesn't say "contractor," the
  agent assumes full-time, since KB-02 states VPN is automatic for full-time
  employees by default. If "contractor" is mentioned, it always requires manager
  approval, per policy.
- **KB-03 vs. Asset Management Policy conflict:** the data pack sets up a genuine
  discrepancy — KB-03's 3-year threshold vs. the Asset Management Policy's 4-year
  refresh cycle. Rather than silently picking one, the agent treats early replacement
  (before 4 years) as requiring **both** IT verification of hardware failure **and**
  Finance sign-off, consistent with how TK-1043 (approved at 3.2 years) was actually
  handled — precedent is used to disambiguate a policy conflict, not to invent a new
  rule.
- **Admin/privileged access (REQ-10 type requests):** no KB article grants IT the
  authority to provision this. The agent never fabricates a policy to justify a
  decision either way; it explicitly states none exists, and routes for approval with
  a business-justification requirement, citing the TK-1050 rejection as precedent.
- **Vague messages** (e.g. REQ-15, "hey can you help, its not working") are never
  guessed at — the agent asks what system/device is involved before doing anything
  else, consistent with "flag unclear ownership rather than inventing it."
- **Software catalog contents** aren't in the data pack, so the agent always asks
  whether the requested software/extension is on the approved catalog unless the
  employee has already said it isn't.
- **Dates/times** shown in the audit trail use the assignment's stated week (Mon 21 –
  Fri 25 Sep 2026) with the visitor's local clock time, purely for a readable demo
  timeline — not a claim about real elapsed time.
- **No PII leaves the browser.** Ticket data for the current session lives in
  `localStorage` only (so a reviewer's demo persists across a page refresh) and is
  never transmitted anywhere; there is no backend to receive it.

## Known limitations (by design, for a 6-hour prototype)
- Classification is keyword-based, not an LLM — see `ARCHITECTURE.md` §4 for how an
  LLM layer would slot in without changing the underlying decision logic.
- No real ticketing-system integration, authentication, or multi-user concurrency —
  this is a single-visitor demo, not a production service desk.
- Follow-up answer parsing is heuristic (looks for yes/no and a few key phrases); a
  production build would use structured input (buttons) or an LLM for this step.
