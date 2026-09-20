# Veridian IT Service Desk — Internal Service Agent (Assignment 2)

A working prototype of an internal IT support agent for Veridian Corp, built from the
Assignment 2 Data Pack. No backend, no API keys, no build step.

**Live prototype:** open `veridian-it-service-agent.html` directly in any browser —
double-click it, or serve it statically. That's the one-command run:

```bash
# from this folder — any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000/veridian-it-service-agent.html
```

Or just open the file directly with no server at all (`file://...`) — it has no
external dependencies besides two Google Fonts loaded over HTTPS.

## What it does
- Understands a free-text employee IT issue and matches it to one of the 10
  Knowledge Base policies (or the Asset Management Policy).
- Asks a follow-up question when a detail is missing (device age, contractor vs.
  full-time, software catalog status, remote days/week) rather than guessing.
- Resolves simple, self-service cases directly (password reset, VPN renewal, guest
  Wi-Fi) and escalates everything else to the right party — IT, IT Security, Finance,
  a manager, or a system owner — citing the exact KB id(s) used.
- Surfaces the two intentional edge cases in the data pack instead of silently
  guessing: the KB-03 vs. Asset Management Policy conflict on laptop replacement age,
  and the admin/server-access request with no governing self-service policy.
- Creates a structured ticket per conversation with a full timestamped audit trail,
  visible in the Tickets panel.
- Ships with the 15 sample employee requests as one-tap chips, plus the 10 existing
  tickets from the data pack shown as read-only precedent.

## Files
| File | Purpose |
|---|---|
| `veridian-it-service-agent.html` | The single-file, ready-to-open prototype (bundled) |
| `index.html` / `data.js` / `agent.js` / `app.js` | Unbundled source, for editing |
| `ARCHITECTURE.md` | Architecture diagram + process flow |
| `ASSUMPTIONS.md` | Inputs, sources, and explicit assumptions |
| `AI_TOOLS_USED.md` | How AI tools were used to build this |

## Try these first
- **REQ-01** (Aditi Sharma) — dead laptop at 3.5 years: surfaces the KB-03 vs. Asset
  Management Policy conflict and routes to IT + Finance.
- **REQ-10** (Kavya Pillai) — urgent admin access request: no policy grants this;
  agent explains why and cites the TK-1050 precedent instead of inventing a rule.
- **REQ-15** (Rahul Menon) — "hey can you help, its not working": agent asks what's
  actually wrong before doing anything.
- Type your own issue in the box to see the classifier handle open-ended input.

## Still to prepare for the full assignment submission
This covers deliverables 1–4 (working prototype, architecture, inputs/assumptions,
AI tools used). Still needed for full submission: the 15-minute demo & defence, a
demo video on Drive, pushing this to a GitHub repo, and the 10-slide PPT.
