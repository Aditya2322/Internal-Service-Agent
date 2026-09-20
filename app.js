(function () {
  "use strict";

  const STORAGE_KEY = "veridian-agent-state-v1";
  let ticketSeq = 1052;
  let tickets = [];      // live tickets created in this session
  let messages = [];      // {who:'user'|'agent', text, citations?, ticketId?}
  let pendingFollowup = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      ticketSeq = s.ticketSeq || 1052;
      tickets = s.tickets || [];
      messages = s.messages || [];
      pendingFollowup = s.pendingFollowup || null;
      return true;
    } catch (e) { return false; }
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ticketSeq, tickets, messages, pendingFollowup }));
    } catch (e) { /* storage unavailable — session still works in-memory */ }
  }

  function nowStamp() {
    // Fixed narrative "today" so the demo stays consistent with the data pack's week.
    const d = new Date();
    const t = d.toTimeString().slice(0, 5);
    return `${TODAY_LABEL} ${t}`;
  }

  function createTicket(seed) {
    const id = "TK-" + (ticketSeq++);
    const t = {
      id,
      employee: seed.employee || "You",
      summary: seed.summary,
      category: seed.category || null,
      status: seed.statusLabel,
      assignedTo: seed.assignedTo,
      citations: seed.citations || [],
      closed: /resolved|rejected|not eligible/i.test(seed.statusLabel || ""),
      audit: [
        { ts: nowStamp(), actor: "Employee", action: seed.summary },
        { ts: nowStamp(), actor: "Agent", action: `${seed.message.slice(0, 140)}${seed.message.length > 140 ? "…" : ""}` }
      ]
    };
    tickets.unshift(t);
    return t;
  }

  function updateLastTicketFollowup(seed, answerText) {
    if (!tickets.length) return null;
    const t = tickets[0];
    t.status = seed.statusLabel;
    t.assignedTo = seed.assignedTo;
    t.citations = Array.from(new Set([...(t.citations || []), ...(seed.citations || [])]));
    t.closed = /resolved|rejected|not eligible/i.test(seed.statusLabel || "");
    t.audit.push({ ts: nowStamp(), actor: "Employee", action: answerText });
    t.audit.push({ ts: nowStamp(), actor: "Agent", action: `${seed.message.slice(0, 140)}${seed.message.length > 140 ? "…" : ""}` });
    return t;
  }

  // ---- Chat rendering -------------------------------------------------------
  const chatScroller = document.getElementById("chatScroller");

  function citeLabel(id) {
    const k = kbById(id);
    return k ? `${id} — ${k.title}` : id;
  }

  function renderMessage(m) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (m.who === "user" ? "user" : "agent");
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = m.who === "user" ? "You" : "Service Desk Agent";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = m.text;
    wrap.appendChild(who);
    wrap.appendChild(bubble);

    if (m.citations && m.citations.length) {
      const pills = document.createElement("div");
      pills.className = "citepills";
      m.citations.forEach(id => {
        const p = document.createElement("span");
        p.className = "citepill";
        p.textContent = citeLabel(id);
        pills.appendChild(p);
      });
      if (!m.citations.length) {
        const p = document.createElement("span");
        p.className = "citepill";
        p.textContent = "no matching policy";
        pills.appendChild(p);
      }
      wrap.appendChild(pills);
    } else if (m.who === "agent" && m.showNoCitation) {
      const pills = document.createElement("div");
      pills.className = "citepills";
      const p = document.createElement("span");
      p.className = "citepill";
      p.textContent = "no governing KB policy found";
      pills.appendChild(p);
      wrap.appendChild(pills);
    }

    if (m.ticketId) {
      const t = tickets.find(x => x.id === m.ticketId);
      if (t) {
        const box = document.createElement("div");
        box.className = "ticket-inline";
        box.innerHTML = `<b>${t.id}</b> · ${escapeHtml(t.status)}<br>Assigned: ${escapeHtml(t.assignedTo)}`;
        box.style.cursor = "pointer";
        box.addEventListener("click", () => openDrawer(t.id));
        wrap.appendChild(box);
      }
    }
    return wrap;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderChat() {
    chatScroller.innerHTML = "";
    if (!messages.length) {
      const intro = document.createElement("div");
      intro.className = "msg agent";
      intro.innerHTML = `<div class="who">Service Desk Agent</div><div class="bubble">Hi — I'm the Veridian IT service desk agent. Describe an issue below, or tap a sample request to see how I handle it (including a couple of tricky/edge cases from this week's queue).</div>`;
      chatScroller.appendChild(intro);
    }
    messages.forEach(m => chatScroller.appendChild(renderMessage(m)));
    chatScroller.scrollTop = chatScroller.scrollHeight;
  }

  function pushUserMessage(text) {
    messages.push({ who: "user", text });
  }
  function pushAgentMessage(decision, ticketId) {
    messages.push({
      who: "agent",
      text: decision.message,
      citations: decision.citations,
      showNoCitation: decision.citations && decision.citations.length === 0,
      ticketId
    });
  }

  function handleUserSubmit(rawText, employeeName) {
    const text = rawText.trim();
    if (!text) return;
    pushUserMessage(text);
    renderChat();

    const decision = runAgent(text, pendingFollowup);

    if (decision.status === "followup") {
      let ticketId = null;
      if (pendingFollowup) {
        // Still gathering info on an already-open ticket — log the exchange, stay open.
        const t = updateLastTicketFollowup(
          { statusLabel: "Pending Info — awaiting employee reply", assignedTo: "Employee", citations: decision.citations, message: decision.message },
          text
        );
        ticketId = t ? t.id : null;
      } else {
        // First turn and we already need more info: open the ticket now so the
        // question and eventual answer both land in one auditable record.
        const t = createTicket({
          employee: employeeName || "You",
          summary: text,
          category: classify(text),
          statusLabel: "Pending Info — awaiting employee reply",
          assignedTo: "Employee",
          citations: decision.citations,
          message: decision.message
        });
        ticketId = t.id;
      }
      pendingFollowup = decision.followup;
      pushAgentMessage(decision, ticketId);
    } else {
      let ticketId;
      if (pendingFollowup) {
        const t = updateLastTicketFollowup(decision, text);
        ticketId = t ? t.id : null;
      } else {
        const t = createTicket({
          employee: employeeName || "You",
          summary: text,
          category: classify(text),
          statusLabel: decision.statusLabel,
          assignedTo: decision.assignedTo,
          citations: decision.citations,
          message: decision.message
        });
        ticketId = t.id;
      }
      pendingFollowup = null;
      pushAgentMessage(decision, ticketId);
    }
    renderChat();
    renderTickets();
    saveState();
  }

  // ---- Chips (sample requests) ----------------------------------------------
  const chipRow = document.getElementById("chipRow");
  EMPLOYEE_REQUESTS.forEach(r => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = `${r.id} — ${r.name.split(" ")[0]}`;
    chip.title = r.text;
    chip.addEventListener("click", () => {
      pendingFollowup = null; // starting a fresh sample resets any half-answered follow-up
      handleUserSubmit(r.text, r.name);
    });
    chipRow.appendChild(chip);
  });

  // ---- Composer ---------------------------------------------------------
  const composerForm = document.getElementById("composerForm");
  const msgInput = document.getElementById("msgInput");
  composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = msgInput.value;
    msgInput.value = "";
    handleUserSubmit(v, "You");
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    tickets = [];
    messages = [];
    pendingFollowup = null;
    ticketSeq = 1052;
    saveState();
    renderChat();
    renderTickets();
  });

  // ---- Right pane: Tickets / KB / About --------------------------------------
  const rpBody = document.getElementById("rpBody");
  const rpTabs = document.querySelectorAll(".rp-tabs button");
  let activeRp = "tickets";

  rpTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      rpTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeRp = btn.dataset.rp;
      renderRightPane();
    });
  });

  function statusClass(status) {
    const s = (status || "").toLowerCase();
    if (s.includes("resolved") || s.includes("not eligible")) return "status-resolved";
    if (s.includes("escalat")) return "status-escalated";
    if (s.includes("pending")) return "status-pending";
    if (s.includes("progress")) return "status-progress";
    if (s.includes("rejected")) return "status-rejected";
    return "status-info";
  }

  function renderTickets() {
    if (activeRp !== "tickets") return;
    rpBody.innerHTML = "";

    const liveLabel = document.createElement("div");
    liveLabel.className = "section-label";
    liveLabel.textContent = `This session (${tickets.length})`;
    rpBody.appendChild(liveLabel);

    if (!tickets.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:12.5px;color:var(--ink-faint);padding:4px 2px 8px;";
      empty.textContent = "No tickets yet — send a request in the chat to see one created here.";
      rpBody.appendChild(empty);
    }
    tickets.forEach(t => rpBody.appendChild(ticketRow(t)));

    const seedLabel = document.createElement("div");
    seedLabel.className = "section-label";
    seedLabel.textContent = "Existing queue (precedent)";
    rpBody.appendChild(seedLabel);
    SEED_TICKETS.forEach(t => rpBody.appendChild(ticketRow(t)));
  }

  function ticketRow(t) {
    const row = document.createElement("div");
    row.className = "ticket-row";
    row.innerHTML = `
      <div class="row-top">
        <span class="tid">${t.id}</span>
        <span class="status-pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span>
      </div>
      <div class="tsum">${escapeHtml(t.summary)}</div>
      <div class="temp">${escapeHtml(t.employee)}${t.assignedTo ? " · assigned: " + escapeHtml(t.assignedTo) : ""}</div>
    `;
    row.addEventListener("click", () => openDrawer(t.id));
    return row;
  }

  function renderKB() {
    if (activeRp !== "kb") return;
    rpBody.innerHTML = "";
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Ground-truth policies the agent can cite";
    rpBody.appendChild(label);
    KB.forEach(k => {
      const card = document.createElement("div");
      card.className = "kb-card";
      card.innerHTML = `<div class="kid">${k.id}</div><h4>${escapeHtml(k.title)}</h4><p>${escapeHtml(k.text)}</p>`;
      rpBody.appendChild(card);
    });
  }

  function renderAbout() {
    if (activeRp !== "about") return;
    rpBody.innerHTML = `
      <div class="section-label">What you're looking at</div>
      <p style="font-size:13px;line-height:1.6;color:var(--ink-soft);">
      This is a working prototype of an internal IT service-desk agent for Veridian Corp,
      built from the Assignment 2 data pack (10 KB articles, one asset policy, 15 employee
      requests, 10 seed tickets). Try the sample chips, or type your own issue.
      </p>
      <div class="section-label">Decision flow, per message</div>
      <ol style="font-size:13px;line-height:1.7;color:var(--ink-soft);padding-left:18px;">
        <li>Classify the issue against the 10 KB categories (keyword match) — or detect a suspected security incident first, always highest priority.</li>
        <li>If a required detail is missing (device age, contractor vs. full-time, catalog status, remote days/week, or the message is too vague to classify), ask one follow-up question rather than assuming.</li>
        <li>Apply the matching policy's rule: self-service resolution, or escalation to IT / Security / Finance / a manager.</li>
        <li>Where policies conflict (see KB-03 vs. the Asset Management Policy) or no policy exists (privileged server access), say so explicitly and route for human sign-off instead of guessing.</li>
        <li>Create or update a structured ticket with a full timestamped audit trail and the exact KB id(s) used, visible in the Tickets tab.</li>
      </ol>
      <div class="section-label">Notable edge cases to try</div>
      <p style="font-size:13px;line-height:1.6;color:var(--ink-soft);">
      REQ-01 (KB-03 vs. Asset Management Policy conflict), REQ-10 (no policy grants admin
      access — precedent TK-1050), REQ-11 (contractor VPN needs manager approval), REQ-15
      (too vague — agent asks before acting).
      </p>
      <div class="section-label">Data boundary</div>
      <p style="font-size:13px;line-height:1.6;color:var(--ink-soft);">
      The agent only reasons over the KB, asset policy, and ticket precedents in the data
      pack — it never invents a policy. Everything runs client-side in your browser; nothing
      is sent to a server. Reset clears this session's tickets only.
      </p>
    `;
  }

  function renderRightPane() {
    if (activeRp === "tickets") renderTickets();
    else if (activeRp === "kb") renderKB();
    else renderAbout();
  }

  // ---- Drawer -----------------------------------------------------------
  const drawer = document.getElementById("drawer");
  const drawerBackdrop = document.getElementById("drawerBackdrop");
  const drawerBody = document.getElementById("drawerBody");
  const drawerTid = document.getElementById("drawerTid");

  function findTicket(id) {
    return tickets.find(t => t.id === id) || SEED_TICKETS.find(t => t.id === id);
  }

  function openDrawer(id) {
    const t = findTicket(id);
    if (!t) return;
    drawerTid.textContent = t.id;
    const citeStr = (t.citations && t.citations.length) ? t.citations.map(citeLabel).join(", ") : "No governing KB policy found";
    drawerBody.innerHTML = `
      <dl class="kv">
        <dt>Employee</dt><dd>${escapeHtml(t.employee)}</dd>
        <dt>Summary</dt><dd>${escapeHtml(t.summary)}</dd>
        <dt>Status</dt><dd><span class="status-pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span></dd>
        <dt>Assigned to</dt><dd>${escapeHtml(t.assignedTo || "—")}</dd>
        <dt>Source(s)</dt><dd>${escapeHtml(citeStr)}</dd>
      </dl>
      <div class="section-label">Audit trail</div>
      <div id="auditList"></div>
    `;
    const list = drawerBody.querySelector("#auditList");
    (t.audit || []).forEach(a => {
      const item = document.createElement("div");
      item.className = "audit-item";
      item.innerHTML = `<span class="ts">${escapeHtml(a.ts)}</span><span class="actor">${escapeHtml(a.actor)}</span><div class="action">${escapeHtml(a.action)}</div>`;
      list.appendChild(item);
    });
    drawer.classList.add("open");
    drawerBackdrop.classList.add("open");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
  }
  document.getElementById("drawerClose").addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

  // ---- Mobile tabs --------------------------------------------------------
  const mobileTabs = document.querySelectorAll("#mobileTabs button");
  const paneChat = document.getElementById("paneChat");
  const paneRight = document.getElementById("paneRight");
  mobileTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      mobileTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.pane === "chat") {
        paneChat.classList.add("mobile-active");
        paneRight.classList.remove("mobile-active");
      } else {
        paneRight.classList.add("mobile-active");
        paneChat.classList.remove("mobile-active");
      }
    });
  });

  // ---- Theme toggle -------------------------------------------------------
  const themeBtn = document.getElementById("themeBtn");
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : cur === "light" ? null : "dark";
    applyTheme(next);
    try { localStorage.setItem("veridian-theme", next || ""); } catch (e) {}
  });
  try {
    const savedTheme = localStorage.getItem("veridian-theme");
    if (savedTheme) applyTheme(savedTheme);
  } catch (e) {}

  // ---- Init ---------------------------------------------------------------
  loadState();
  renderChat();
  renderRightPane();
})();
