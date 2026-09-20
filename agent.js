// ============================================================================
// AGENT — deterministic policy-grounded decision engine.
// Runs entirely client-side: no LLM call required, so the prototype works with
// zero configuration. See "How this works" in the UI / AI_TOOLS_USED.md for
// where an LLM would be layered in for a production build.
//
// Every decision the agent makes cites the KB id(s) it used. If nothing in the
// KB governs a request, the agent says so explicitly rather than inventing a
// policy (mirrors the "flag unclear ownership rather than inventing it" rule).
// ============================================================================

// Keywords are split into "strong" (names a specific system/policy area — always
// wins) and "weak" (generic phrasing like "can't log in" that many categories
// could plausibly use, and should only decide the category when nothing more
// specific is present). This stops e.g. an expense-tool login issue from being
// misclassified as a plain password reset just because both mention "log in".
const CATEGORY_KEYWORDS = {
  "KB-09": { strong: ["phishing", "malware", "suspicious email", "unauthorized access", "security incident", "virus", "hacked", "scam email"], weak: [] },
  "KB-01": { strong: ["password", "locked out", "lockout", "lock out", "forgot my password", "account locked", "self-service portal"], weak: ["can't log in", "cant log in", "cannot log in", "cant sign in", "can't sign in", "login failed"] },
  "OTHER-ADMIN": { strong: ["admin access", "root access", "administrator access", "privileged access", "admin rights", "sudo access"], weak: [] },
  "KB-02": { strong: ["vpn"], weak: [] },
  "KB-08": { strong: ["expense tool", "expense software", "expense management", "expense system", "expense app"], weak: ["expense"] },
  "KB-07": { strong: ["guest wifi", "guest wi-fi", "guest network", "front-desk kiosk"], weak: ["guest"] },
  "KB-10": { strong: ["work from home", "wfh", "home office", "office chair", "ergonomic chair"], weak: ["remote", "monitor"] },
  "KB-06": { strong: ["mailbox", "email quota", "inbox full", "storage full", "can't send email", "cant send email", "mail quota"], weak: ["quota"] },
  "KB-05": { strong: ["printer", "paper jam", "print queue", "spooler", "printing"], weak: [] },
  "KB-03": { strong: ["laptop", "notebook won't turn on", "screen flicker", "laptop dead", "laptop broken", "laptop screen", "device won't turn on", "hardware failure", "won't turn on", "wont turn on"], weak: [] },
  "KB-04": { strong: ["install", "non-catalog", "browser add-on", "browser extension", "software catalog"], weak: ["software", "extension", "application"] }
};

const PRIORITY_ORDER = ["KB-09", "OTHER-ADMIN", "KB-02", "KB-08", "KB-07", "KB-10", "KB-06", "KB-05", "KB-03", "KB-04", "KB-01"];

function classify(rawText) {
  const text = " " + rawText.toLowerCase() + " ";

  // Special-case: "Wi-Fi" + "guest" together, in either order/spacing, is
  // always a guest Wi-Fi request even if the exact phrase isn't matched above.
  if (/guest/.test(text) && /wi[\s-]?fi/.test(text)) return "KB-07";

  let strongBest = null, strongScore = 0;
  for (const cat of PRIORITY_ORDER) {
    let score = 0;
    for (const kw of CATEGORY_KEYWORDS[cat].strong) {
      if (text.includes(kw)) score += kw.length;
    }
    if (score > strongScore) { strongScore = score; strongBest = cat; }
  }
  if (strongBest) return strongBest;

  let weakBest = null, weakScore = 0;
  for (const cat of PRIORITY_ORDER) {
    let score = 0;
    for (const kw of CATEGORY_KEYWORDS[cat].weak) {
      if (text.includes(kw)) score += kw.length;
    }
    if (score > weakScore) { weakScore = score; weakBest = cat; }
  }
  return weakBest;
}

function extractYears(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y\b)/i);
  return m ? parseFloat(m[1]) : null;
}

function mentionsContractor(text) {
  return /contractor|contract worker|contract staff|freelancer/i.test(text);
}

function mentionsFullTime(text) {
  return /full[\s-]?time|fte\b|permanent employee/i.test(text);
}

function daysRemote(text) {
  const m = text.match(/(\d)\s*days?\s*(?:a|per)?\s*week/i);
  return m ? parseInt(m[1], 10) : null;
}

function isVague(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const hasSignal = classify(text) !== null;
  return !hasSignal && words.length <= 8;
}

// ---- Category handlers -----------------------------------------------------
// Each handler returns a decision object:
// { status: 'resolve'|'escalate'|'followup', message, citations:[ids],
//   assignedTo, statusLabel, followup?: {kind, category} }

function handlePassword(text) {
  const failed = text.match(/(\d+)\s*(?:times|attempts)/i);
  const n = failed ? parseInt(failed[1], 10) : null;
  if (n !== null && n >= 5) {
    return {
      status: "escalate",
      statusLabel: "In Progress — IT unlocking",
      assignedTo: "IT",
      citations: ["KB-01"],
      message: `That's past the 5-failed-attempt threshold, so self-service reset won't unlock it. Per KB-01, I've routed this to IT for a manual unlock — no approval needed. You'll get a confirmation once it's done.`
    };
  }
  return {
    status: "resolve",
    statusLabel: "Resolved — self-service",
    assignedTo: "Employee",
    citations: ["KB-01"],
    message: `You can reset this yourself any time via the self-service portal — per KB-01, no approval or ticket is required. If you hit 5 failed attempts and get locked out, message me again and I'll route it to IT for a manual unlock.`
  };
}

function handleVPN(text) {
  if (mentionsContractor(text)) {
    return {
      status: "escalate",
      statusLabel: "Pending manager approval",
      assignedTo: "Manager",
      citations: ["KB-02"],
      message: `Per KB-02, contractors don't get VPN access automatically — their manager needs to submit the access request form for approval. I've opened a ticket routed to the manager for sign-off; once approved, IT will provision access. Credentials will then expire on a 90-day renewal cycle, same as everyone else's.`
    };
  }
  return {
    status: "resolve",
    statusLabel: "Resolved — self-service",
    assignedTo: "Employee",
    citations: ["KB-02"],
    message: `Per KB-02, VPN credentials expire every 90 days and renewal is self-service — no approval needed for a full-time employee. Please renew through the VPN client/portal. If renewal itself fails (not just an expiry notice), let me know and I'll escalate to IT.`
  };
}

function handleLaptop(text) {
  const years = extractYears(text);
  const failureWords = /dead|won'?t turn on|wont turn on|no power|not turning on|screen flicker|broken/i.test(text);

  if (years !== null && years < 3 && !failureWords) {
    return {
      status: "followup",
      citations: ["KB-03"],
      message: `Your device is under the standard 3-year replacement window in KB-03, so a routine replacement isn't eligible yet. Is this actually a hardware fault (won't boot, physical damage, etc.), or more of a performance complaint? If it's a verified fault, KB-03 allows earlier replacement.`,
      followup: { kind: "laptop_fault_check", category: "KB-03" }
    };
  }

  if (failureWords) {
    // Potential conflict: KB-03 allows early replacement for verified hardware failure;
    // Asset Management Policy imposes a 4-year cycle and requires Finance sign-off for
    // anything early. The agent surfaces this conflict rather than silently picking one.
    return {
      status: "escalate",
      statusLabel: "Escalated — hardware verification + Finance sign-off",
      assignedTo: "IT + Finance",
      citations: ["KB-03", "ASSET-POLICY"],
      message: `Two policies apply here and they don't fully agree: KB-03 allows early replacement for verified hardware failure, but the Asset Management Policy sets a 4-year refresh cycle and requires Finance sign-off for anything earlier than that${years ? ` (yours is ~${years} yrs)` : ""}. I'm not able to resolve that conflict myself, so I've opened a ticket for IT to verify the fault and Finance to sign off — the same path used for TK-1043 (approved at 3.2 yrs). You don't need to do anything further right now.`
    };
  }

  return {
    status: "followup",
    citations: ["KB-03"],
    message: `Can you tell me a bit more — is the laptop actually failing (won't power on, physical damage), and roughly how old is it? That decides whether this is a routine 3-year replacement (KB-03) or needs Finance sign-off for an early swap.`,
    followup: { kind: "laptop_fault_check", category: "KB-03" }
  };
}

function handleSoftware(text) {
  const explicitlyNonCatalog = /not in the (?:software )?catalog|non-?catalog|isn'?t (?:in the )?catalog/i.test(text);
  const isExtension = /extension|add-?on/i.test(text);
  const trackingConcern = /tracking|monitoring|surveillance/i.test(text);

  if (explicitlyNonCatalog) {
    return {
      status: "escalate",
      statusLabel: "Pending Security review",
      assignedTo: "IT Security",
      citations: ["KB-04"],
      message: `Since this isn't in the approved catalog, per KB-04 it needs an IT Security review before install — that typically takes 3–5 business days. I've opened a ticket for Security.${trackingConcern ? " Flagging for Security's attention: this is a monitoring/tracking-type extension, which usually gets extra scrutiny beyond the standard non-catalog review." : ""}`
    };
  }
  return {
    status: "followup",
    citations: ["KB-04"],
    message: `Is this listed in the approved software catalog? Catalog software can be self-installed with no ticket; anything outside the catalog needs a 3–5 business day IT Security review per KB-04.`,
    followup: { kind: "software_catalog_check", category: "KB-04" }
  };
}

function handlePrinter(text) {
  const alreadyTried = /restart(?:ed)?|already (?:tried|restarted|checked)|still (?:not working|jammed|showing)|persists?/i.test(text);
  if (alreadyTried) {
    return {
      status: "escalate",
      statusLabel: "In Progress — technician assigned",
      assignedTo: "IT",
      citations: ["KB-05"],
      message: `Since restarting the spooler and clearing the queue didn't fix it, per KB-05 this goes to a technician with the printer's asset tag. I've logged the ticket — could you share the printer's asset tag (usually a sticker on the side/back) so it's routed correctly?`
    };
  }
  return {
    status: "followup",
    citations: ["KB-05"],
    message: `Per KB-05, first check the print queue and restart the print spooler — that clears most false paper-jam errors. Can you try that and let me know if it's still happening afterwards?`,
    followup: { kind: "printer_retry_check", category: "KB-05" }
  };
}

function handleMailbox(text) {
  return {
    status: "escalate",
    statusLabel: "Pending manager approval (interim: archive)",
    assignedTo: "Employee + Manager",
    citations: ["KB-06"],
    message: `Immediate fix: archive older mail to get under the 25GB default quota per KB-06 — that unblocks sending right away. If you need more room long-term, a quota increase needs manager approval and is capped at 50GB. I've opened a ticket for that approval in parallel so you're not blocked either way.`
  };
}

function handleGuestWifi(text) {
  return {
    status: "resolve",
    statusLabel: "Resolved — self-service",
    assignedTo: "Employee",
    citations: ["KB-07"],
    message: `No ticket needed — per KB-07, any employee can generate guest Wi-Fi credentials from the front-desk kiosk, valid for 24 hours. You can do this yourself right before your guest arrives.`
  };
}

function handleExpense(text) {
  const isAccessRequest = /don'?t have (?:an )?account|need access|no account|get access|create.*account/i.test(text);
  if (isAccessRequest) {
    return {
      status: "escalate",
      statusLabel: "Routed to Finance",
      assignedTo: "Finance",
      citations: ["KB-08"],
      message: `Per KB-08, access to the expense tool is granted by Finance, not IT — I've routed this to Finance to set up your account. Once you have one, come back to IT for any login/technical issues.`
    };
  }
  return {
    status: "followup",
    citations: ["KB-08"],
    message: `Per KB-08, IT can help with login/technical issues on an existing expense-tool account (Finance handles granting access itself). Could you send a screenshot of the exact error you're seeing?`,
    followup: { kind: "expense_screenshot", category: "KB-08" }
  };
}

function handleSecurity(text) {
  const forwarded = /forward(?:ed|ing)?\s+(?:it\s+)?to/i.test(text);
  let message = `Reported and escalated to security@veridian-corp.example immediately per KB-09 — no ticket delay on this one.`;
  if (forwarded) {
    message += ` One flag: KB-09 says a suspected phishing email should go straight to Security and should not be forwarded to other employees. Please avoid forwarding it further — Security will loop in anyone who needs to know.`;
  }
  return {
    status: "escalate",
    statusLabel: "Escalated to Security",
    assignedTo: "Security",
    citations: ["KB-09"],
    message
  };
}

function handleWFH(text) {
  const days = daysRemote(text);
  if (days !== null && days <= 3) {
    return {
      status: "followup",
      citations: ["KB-10"],
      message: `KB-10's home-office allowance applies to employees remote more than 3 days/week — at ${days} day(s)/week you're not over that threshold. Is your remote schedule actually more than 3 days/week, or did I misread that?`,
      followup: { kind: "wfh_days_check", category: "KB-10" }
    };
  }
  return {
    status: "escalate",
    statusLabel: "Pending manager sign-off + Finance",
    assignedTo: "Manager + Finance",
    citations: ["KB-10"],
    message: `You qualify under KB-10 (remote more than 3 days/week) for a one-time home office allowance. It needs your manager's sign-off and Finance processing first — IT only handles shipping once that's approved. I've opened a ticket routed to your manager to start that.`
  };
}

function handleAdminAccess(text) {
  return {
    status: "escalate",
    statusLabel: "Escalated — no policy grants this",
    assignedTo: "System Owner",
    citations: [],
    message: `I don't have a KB policy that lets IT grant admin/privileged server access directly — this needs a documented business justification and sign-off from the system's owner (and likely your manager). Urgency on its own isn't sufficient grounds, and the last similar request (TK-1050) was rejected for missing business justification. I've opened a ticket routed for approval rather than granting anything myself — could you add the specific business justification so it can be reviewed quickly?`
  };
}

function handleVague() {
  return {
    status: "followup",
    citations: [],
    message: `Could you say a bit more about what's not working — which system or device, and what you were trying to do? I'd rather ask than guess at the wrong fix.`,
    followup: { kind: "clarify_vague", category: null }
  };
}

const HANDLERS = {
  "KB-01": handlePassword,
  "KB-02": handleVPN,
  "KB-03": handleLaptop,
  "KB-04": handleSoftware,
  "KB-05": handlePrinter,
  "KB-06": handleMailbox,
  "KB-07": handleGuestWifi,
  "KB-08": handleExpense,
  "KB-09": handleSecurity,
  "KB-10": handleWFH,
  "OTHER-ADMIN": handleAdminAccess
};

// Interpret a free-text answer to a previously-asked follow-up question.
function resolveFollowup(followup, answerText, originalText) {
  const text = answerText.toLowerCase();
  const yes = /\b(yes|yeah|yep|correct|right|true|it is)\b/.test(text);
  const no = /\b(no|nope|not really|false|it'?s not)\b/.test(text);

  switch (followup.kind) {
    case "laptop_fault_check": {
      const failureWords = /dead|won'?t turn on|wont turn on|no power|broken|hardware|fault|damage/i.test(text) || yes;
      if (failureWords) {
        return {
          status: "escalate",
          statusLabel: "Escalated — hardware verification + Finance sign-off",
          assignedTo: "IT + Finance",
          citations: ["KB-03", "ASSET-POLICY"],
          message: `Understood — treating this as a verified/likely hardware fault. As with TK-1043, early replacement inside the 4-year Asset Management Policy cycle needs both IT verification and Finance sign-off; a routine 3-year-mark replacement only needs KB-03. I've opened a ticket for IT to verify the fault, which will determine which path applies.`
        };
      }
      return {
        status: "escalate",
        statusLabel: "In Progress — troubleshooting",
        assignedTo: "IT",
        citations: ["KB-03"],
        message: `Since it doesn't sound like a hardware fault, I've opened a repair/troubleshooting ticket with IT rather than a replacement request — that's usually faster and doesn't need Finance sign-off. If IT determines it can't be fixed, they'll convert this into a replacement case under KB-03 / the Asset Management Policy.`
      };
    }
    case "software_catalog_check": {
      if (no) {
        return {
          status: "escalate",
          statusLabel: "Pending Security review",
          assignedTo: "IT Security",
          citations: ["KB-04"],
          message: `Got it — since it's not in the catalog, per KB-04 this needs an IT Security review (3–5 business days). I've opened a ticket for Security.`
        };
      }
      if (yes) {
        return {
          status: "resolve",
          statusLabel: "Resolved — self-install",
          assignedTo: "Employee",
          citations: ["KB-04"],
          message: `Since it's in the approved catalog, per KB-04 you can self-install it directly — no ticket or review needed.`
        };
      }
      return {
        status: "escalate",
        statusLabel: "Pending Security review",
        assignedTo: "IT Security",
        citations: ["KB-04"],
        message: `I can't confirm catalog status from that — to stay safe I've routed this to IT Security for the standard non-catalog review (3–5 business days) per KB-04. If it turns out to be catalog software, they'll close this out immediately and you can self-install.`
      };
    }
    case "printer_retry_check": {
      if (no) {
        return {
          status: "resolve",
          statusLabel: "Resolved",
          assignedTo: "Employee",
          citations: ["KB-05"],
          message: `Good — glad that fixed it, no ticket needed.`
        };
      }
      return {
        status: "escalate",
        statusLabel: "In Progress — technician assigned",
        assignedTo: "IT",
        citations: ["KB-05"],
        message: `Since it's still happening after a spooler restart, per KB-05 this goes to a technician with the printer's asset tag. I've logged the ticket — please share the asset tag when you can.`
      };
    }
    case "wfh_days_check": {
      const days = daysRemote(text);
      const overThreshold = (days !== null && days > 3) || (yes && days === null);
      if (overThreshold) {
        return {
          status: "escalate",
          statusLabel: "Pending manager sign-off + Finance",
          assignedTo: "Manager + Finance",
          citations: ["KB-10"],
          message: `Thanks — that qualifies under KB-10. It needs manager sign-off and Finance processing before IT handles shipping. I've opened a ticket routed to your manager.`
        };
      }
      return {
        status: "resolve",
        statusLabel: "Not eligible",
        assignedTo: "Employee",
        citations: ["KB-10"],
        message: `At 3 days/week or fewer, KB-10's home-office allowance threshold ("more than 3 days/week") isn't met, so I can't route this for equipment approval. Happy to revisit if your remote schedule changes.`
      };
    }
    case "expense_screenshot": {
      return {
        status: "escalate",
        statusLabel: "In Progress — IT reviewing",
        assignedTo: "IT",
        citations: ["KB-08"],
        message: `Thanks, noted on the ticket for IT to investigate the login issue. If it turns out your account was never provisioned, per KB-08 that part gets routed to Finance instead.`
      };
    }
    case "clarify_vague": {
      const cat = classify(answerText);
      if (cat && HANDLERS[cat]) {
        return HANDLERS[cat](answerText);
      }
      return {
        status: "followup",
        citations: [],
        message: `I still don't have enough to match this to a known IT service area (accounts, VPN, hardware, software, printers, mailbox, Wi-Fi, expense tool, security, or home-office equipment). Could you name the system and what's going wrong?`,
        followup: { kind: "clarify_vague", category: null }
      };
    }
    default:
      return { status: "followup", citations: [], message: "Could you clarify that a bit more?", followup };
  }
}

function runAgent(text, pendingFollowup) {
  if (pendingFollowup) {
    return resolveFollowup(pendingFollowup, text, text);
  }
  if (isVague(text)) {
    return handleVague();
  }
  const cat = classify(text);
  if (!cat || !HANDLERS[cat]) {
    return {
      status: "followup",
      citations: [],
      message: `I don't have a Knowledge Base policy that clearly matches this. Could you tell me more about which system this involves — accounts/password, VPN, laptop hardware, software installs, printers, mailbox, guest Wi-Fi, the expense tool, a security concern, or home-office equipment?`,
      followup: { kind: "clarify_vague", category: null }
    };
  }
  return HANDLERS[cat](text);
}
