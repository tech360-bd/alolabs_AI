/**
 * Depth content for the twelve service lines.
 *
 * Kept as a separate map rather than inline in SERVICE_LINES because it is the
 * part that grows: adding a FAQ or a process step should not move the delivery
 * facts. `serviceBySlug()` merges the two, so every consumer still sees one
 * object.
 *
 * ── The rule this file follows ──────────────────────────────────────────────
 * Everything describes what the CLIENT RECEIVES and how the engagement runs.
 * Nothing describes how ALO Labs staffs, sources, assembles or supplies the
 * work, and nothing states how many internal agents exist. That is deliberate:
 * the public page sells the outcome, not our supply chain.
 */

export interface ServiceDepth {
  audience: { fit: string[]; notFit: string[] }
  process: { title: string; detail: string; duration: string }[]
  faq: { q: string; a: string }[]
  engagement: { startingPoint: string; typicalRange: string; commercialModel: string }
  visual: {
    gradient: [string, string]
    motif:
      | 'circuit' | 'network' | 'layers' | 'flow' | 'browser' | 'grid'
      | 'signal' | 'frames' | 'wave' | 'nodes' | 'chart' | 'cloud'
    alt: string
  }
}

export const SERVICE_DEPTH: Record<string, ServiceDepth> = {
  'ai-software-development': {
    audience: {
      fit: [
        'You have a process that costs a team real hours every week and is specific to how your business runs',
        'You already tried a general AI tool and it could not reach the part of the workflow that hurts',
        'You want the model choices, prompts and guardrails to live in your codebase, not in someone else’s dashboard',
      ],
      notFit: [
        'You want a chatbot on the website and nothing behind it',
        'There is no existing process to improve — you need product discovery first',
      ],
    },
    process: [
      { title: 'Process audit', detail: 'We sit with the people doing the work today and record the real steps, including the exceptions nobody documented.', duration: '3–5 days' },
      { title: 'Architecture and scope', detail: 'A written design before any code: where the model sits, what it may and may not touch, and how a human corrects a wrong answer.', duration: '1 week' },
      { title: 'Build in vertical slices', detail: 'One complete path from input to reviewed output working end to end before the second path starts. You see it working while it is being built.', duration: '4–12 weeks' },
      { title: 'Verification and handover', detail: 'Tests covering the failure paths, a documented runbook, and a walkthrough with the team who will own it.', duration: '1–2 weeks' },
    ],
    faq: [
      { q: 'Do we own the code?', a: 'Yes. You receive the repository, the tests and the documentation. Nothing in the delivered system requires a subscription to us to keep running.' },
      { q: 'Which AI model do you use?', a: 'Whichever is right for the task and your constraints — hosted, self-hosted or a local model on your own hardware. The choice is made during architecture and written down, and the system is built so it can be swapped later without a rewrite.' },
      { q: 'What happens when the AI gets something wrong?', a: 'Every AI step has a review screen, a way to correct the output, and a log of what was suggested versus what was accepted. The system is designed on the assumption that it will sometimes be wrong.' },
      { q: 'How is this priced?', a: 'Fixed scope after the architecture stage, so the number does not move while we build. The audit is a small fixed fee that is credited against the build if you proceed.' },
    ],
    engagement: {
      startingPoint: 'A fixed-fee process audit, typically one week.',
      typicalRange: 'Most first releases land between 6 and 14 weeks of build.',
      commercialModel: 'Fixed price per agreed scope; changes are quoted, never absorbed silently.',
    },
    visual: { gradient: ['#FC5400', '#FF9A3C'], motif: 'circuit', alt: 'An abstract circuit motif suggesting AI embedded inside an existing process.' },
  },

  'ai-agent-development': {
    audience: {
      fit: [
        'You have a narrow, repeating task that takes a decision and an action, not just an answer',
        'You need to state an agent’s permissions in a sentence and prove afterwards what it did',
        'You are willing to start with one agent that works rather than five that demo well',
      ],
      notFit: [
        'You want an agent that can do everything and has access to every system',
        'The task has no clear definition of done — an agent cannot be bounded against an unclear goal',
      ],
    },
    process: [
      { title: 'Task specification', detail: 'The role, the tools it may call, what it must never do, and the stop condition that ends an attempt.', duration: '2–4 days' },
      { title: 'Tool implementation', detail: 'Each tool gets input validation and an explicit failure mode. An agent is only as safe as the tools it is allowed to reach.', duration: '1–3 weeks' },
      { title: 'Bounded trial', detail: 'The agent runs against real history first — replays of past cases — before it is allowed to act on a live queue.', duration: '1–2 weeks' },
      { title: 'Approval gate and release', detail: 'Consequential actions route to a human. The gate stays until you decide to remove it, not us.', duration: '1 week' },
    ],
    faq: [
      { q: 'Can the agent act without approval?', a: 'Only where you explicitly allow it. Every agent ships with an approval gate on anything consequential — sending money, emailing a customer, deleting a record — and the gate is a configuration, not a code change.' },
      { q: 'How do we know what it did?', a: 'Every tool call is logged with its input, its output and the decision that triggered it. You can reconstruct any past run step by step.' },
      { q: 'What stops it looping forever?', a: 'A hard step budget, a wall-clock deadline and a stop condition defined in the specification. Hitting any of them ends the run and reports why rather than retrying silently.' },
      { q: 'Can it use our internal systems?', a: 'Yes, through tools we build for each system with its own credentials and input validation. The agent never receives a credential it does not need for the task at hand.' },
    ],
    engagement: {
      startingPoint: 'One agent, one task, scoped and delivered as a pilot.',
      typicalRange: 'A production agent is typically 4–8 weeks including the bounded trial.',
      commercialModel: 'Fixed price for the pilot; further agents are quoted per task.',
    },
    visual: { gradient: ['#00309C', '#3B82F6'], motif: 'network', alt: 'Connected nodes representing a single agent reaching a bounded set of tools.' },
  },

  'multi-agent-systems': {
    audience: {
      fit: [
        'A single agent has become unpredictable because it was given every tool',
        'Work needs different skills at different stages and you need to see which stage failed',
        'You want a plan you can inspect before it executes, not a transcript you read afterwards',
      ],
      notFit: [
        'One agent with a clear scope already solves the problem',
        'The work is genuinely linear and a plain workflow costs a tenth as much',
      ],
    },
    process: [
      { title: 'Decomposition', detail: 'We map the work into stages and decide which stages need a specialist and which are plain code.', duration: '1 week' },
      { title: 'Orchestration design', detail: 'Who plans, who executes, who checks, and what happens when two of them disagree.', duration: '1 week' },
      { title: 'Isolated build', detail: 'Each specialist is built and tested alone against its own inputs before it joins the plan.', duration: '3–6 weeks' },
      { title: 'Integration and audit', detail: 'The full plan runs end to end and the audit trail is verified across every hop.', duration: '1–2 weeks' },
    ],
    faq: [
      { q: 'Why several agents instead of one?', a: 'Because a single agent holding every tool has to be trusted with every tool. Splitting the work lets each stage be limited to what it needs, and makes a failure nameable — you can see which stage broke.' },
      { q: 'How is a run audited?', a: 'Every hop is recorded: the plan, which specialist handled each stage, what it was given, what it returned, and where a human intervened. A failed run is reconstructable, not just reported.' },
      { q: 'Can a stage be a human?', a: 'Yes. A human reviewer is a first-class stage, and the plan waits for them. That is often the right first design.' },
      { q: 'Does this replace our team?', a: 'No. It absorbs the repeated coordination work — routing, checking, summarising — and routes judgement to the people who hold it.' },
    ],
    engagement: {
      startingPoint: 'A decomposition workshop that produces the stage map.',
      typicalRange: 'A working multi-stage system is typically 8–16 weeks.',
      commercialModel: 'Phased: decomposition fixed-fee, build quoted against the agreed stage map.',
    },
    visual: { gradient: ['#6D28D9', '#00309C'], motif: 'layers', alt: 'Stacked layers representing stages of a plan that can be inspected separately.' },
  },

  'business-process-automation': {
    audience: {
      fit: [
        'The same people re-key the same information between systems every week',
        'You need the automation to fail visibly and hand back to a person, not fail silently',
        'You want to measure the hours saved rather than estimate them',
      ],
      notFit: [
        'The underlying process changes every month — automate after it stabilises',
        'The bottleneck is a decision that needs judgement no one has written down',
      ],
    },
    process: [
      { title: 'Process capture', detail: 'We measure the current process — how often it runs, how long it takes, where it breaks.', duration: '3–5 days' },
      { title: 'Automation candidates', detail: 'A ranked list of what to automate first by hours saved against risk. Most processes have one step worth doing before the rest.', duration: '2 days' },
      { title: 'Build with a human fallback', detail: 'The automated path plus an explicit escape to a person when the input does not match expectations.', duration: '2–6 weeks' },
      { title: 'Measure and extend', detail: 'Baseline hours versus actual after release, then the next candidate from the ranked list.', duration: 'Ongoing' },
    ],
    faq: [
      { q: 'How much does automation actually save?', a: 'We measure it rather than claim it. The capture stage gives a baseline, and you get the before-and-after numbers for your own process rather than an industry average.' },
      { q: 'What happens when the automation cannot handle an input?', a: 'It stops and hands the item to a person with the reason attached. Silent skipping is the failure mode that destroys trust in automation, so it is designed out.' },
      { q: 'Do we need to replace our existing systems?', a: 'No. Most automation sits between systems you already own, using their APIs or files. Replacing core systems is a different and much larger project.' },
      { q: 'Who maintains it?', a: 'You can. The runbooks and tests are handed over. If you prefer us to run it, that is a separate support agreement.' },
    ],
    engagement: {
      startingPoint: 'A measured process capture with a ranked automation list.',
      typicalRange: 'A first automation goes live in 3–8 weeks.',
      commercialModel: 'Capture fixed-fee, then fixed price per automation.',
    },
    visual: { gradient: ['#047857', '#10B981'], motif: 'flow', alt: 'A flow line with one branch handing back to a person.' },
  },

  'web-application-development': {
    audience: {
      fit: [
        'You need one codebase that serves a marketing site and the application behind it',
        'Accessibility and Core Web Vitals are requirements, not an afterthought',
        'The site has to be editable by your team without a developer for routine changes',
      ],
      notFit: [
        'You need a five-page brochure site this week — a template does that better and cheaper',
        'The product idea is not yet validated and you need research, not engineering',
      ],
    },
    process: [
      { title: 'Structure and content model', detail: 'The page hierarchy, the content types and who edits what before any design.', duration: '3–5 days' },
      { title: 'Design system', detail: 'Type scale, colour, spacing and the component set — the rules that keep the fiftieth page consistent with the first.', duration: '1–2 weeks' },
      { title: 'Build and integrate', detail: 'Server-rendered pages, real data, authentication where needed, automated accessibility checks in CI.', duration: '3–10 weeks' },
      { title: 'Performance and launch', detail: 'Budgeted Core Web Vitals, structured data, sitemap and a measured launch rather than a hopeful one.', duration: '1 week' },
    ],
    faq: [
      { q: 'Will it be accessible?', a: 'Accessibility is checked in CI on every commit, not audited once at the end. Contrast, focus order, labels and keyboard paths are linted as part of the build.' },
      { q: 'Can our team edit the content?', a: 'Yes. Routine content changes go through an editing interface with the guardrails baked in, so a page cannot be published in a broken state.' },
      { q: 'How fast will it be?', a: 'We set a budget for Core Web Vitals before build starts and treat exceeding it as a defect. Static and server-rendered pages, images sized and served in modern formats.' },
      { q: 'Does it rank well in search?', a: 'Structure, metadata, canonical URLs and structured data are part of the build. Ranking also depends on the content — for that, see AI Marketing & SEO.' },
    ],
    engagement: {
      startingPoint: 'A structure and content-model workshop.',
      typicalRange: 'A site with an integrated application is typically 6–12 weeks.',
      commercialModel: 'Fixed price per phase; content migration quoted separately.',
    },
    visual: { gradient: ['#00309C', '#0EA5E9'], motif: 'browser', alt: 'A browser frame with a structured layout grid inside it.' },
  },

  'enterprise-crm-platforms': {
    audience: {
      fit: [
        'Your customer record is split across spreadsheets, inboxes and one tool nobody likes',
        'You need permissions that match how your organisation actually works',
        'You want one system of record your team will actually use',
      ],
      notFit: [
        'An off-the-shelf CRM already fits and you only need configuration',
        'You have not yet agreed what a customer record contains — that decision comes first',
      ],
    },
    process: [
      { title: 'Record definition', detail: 'What exactly is a customer, a deal, an interaction — agreed with the people who use it daily.', duration: '1 week' },
      { title: 'Permission model', detail: 'Roles mapped to real responsibilities, with the sensitive fields identified explicitly.', duration: '1 week' },
      { title: 'Build and migrate', detail: 'The platform plus a verified migration of existing data, including the duplicates.', duration: '6–14 weeks' },
      { title: 'Adoption support', detail: 'Training, and a feedback loop for the first month — the period when a CRM succeeds or is abandoned.', duration: '4 weeks' },
    ],
    faq: [
      { q: 'Why build instead of buying?', a: 'Buy when a standard CRM fits. Build when the thing that makes your business work is the part a standard CRM cannot express — pricing rules, approval chains, a compliance step unique to your sector.' },
      { q: 'What about our existing data?', a: 'Migration is part of the project, including de-duplication. A CRM that launches with dirty data is abandoned within a quarter, so the data work is not optional.' },
      { q: 'Can it integrate with our finance system?', a: 'Yes, through the integration work on the API & System Integration line. The CRM does not need to own the general ledger to show the numbers that matter.' },
      { q: 'How long before the team uses it?', a: 'It depends on how much changes for them. We include a first-month adoption loop because the technical launch is not the moment usage starts.' },
    ],
    engagement: {
      startingPoint: 'A record-and-permission definition workshop.',
      typicalRange: 'A working platform with migrated data is typically 8–16 weeks.',
      commercialModel: 'Phased fixed price; migration and adoption quoted as explicit phases.',
    },
    visual: { gradient: ['#00309C', '#6366F1'], motif: 'grid', alt: 'A grid of records with one highlighted relationship path.' },
  },

  'ai-marketing-seo': {
    audience: {
      fit: [
        'You want to be found in search and cited by AI assistants, not just appear in ads',
        'You can supply expertise and want it turned into structured, answerable content',
        'You care about quality not volume — a hundred thin pages will hurt you',
      ],
      notFit: [
        'You want a thousand articles a month to game a ranking — that is the pattern search engines penalise',
        'There is no subject expertise to draw on and no one to review the output',
      ],
    },
    process: [
      { title: 'Question research', detail: 'The questions your customers actually type, and where you currently have no answer.', duration: '1–2 weeks' },
      { title: 'Content architecture', detail: 'Topic clusters, internal linking and the page types that map to each question.', duration: '1 week' },
      { title: 'Production with review', detail: 'Content written against a brief, reviewed by a human with domain knowledge, then published with structured data.', duration: 'Ongoing' },
      { title: 'Measurement', detail: 'Impressions, clicks and AI-assistant citations tracked per page, reviewed monthly.', duration: 'Monthly' },
    ],
    faq: [
      { q: 'Will AI-written content be penalised?', a: 'Search engines penalise low-value mass-produced pages, not automation itself. The determining factor is whether the page answers a real question better than the alternative. Every page here is briefed, reviewed and tied to a real question.' },
      { q: 'How do you measure AI-assistant citations?', a: 'By tracking which of your pages are referenced in assistant answers for your target questions, alongside conventional search metrics. It is a newer measurement and we report it as observed, not as a guarantee.' },
      { q: 'Who reviews the content?', a: 'A human with domain knowledge, every time, before publication. Automation without review is how accuracy fails.' },
      { q: 'Can you work with our existing site?', a: 'Yes if it is technically sound. If it is not — slow, unstructured, unindexable — the web development line fixes that first, because content on a broken site does not rank.' },
    ],
    engagement: {
      startingPoint: 'A question-research sprint and content architecture.',
      typicalRange: 'Results are typically visible over 3–6 months, not weeks.',
      commercialModel: 'Monthly retainer for production and measurement; architecture as a fixed fee.',
    },
    visual: { gradient: ['#FC5400', '#F59E0B'], motif: 'signal', alt: 'A rising signal line above a set of connected question nodes.' },
  },

  'ai-image-video': {
    audience: {
      fit: [
        'You need consistent visual assets at a volume a photographer cannot supply',
        'You need a documented rights position for every asset you publish',
        'You want brand consistency enforced by rules, not by luck',
      ],
      notFit: [
        'You need photographs of a real specific place or person — generation cannot substitute',
        'There is no brand system to be consistent with yet',
      ],
    },
    process: [
      { title: 'Visual brief and rules', detail: 'The visual language, the do-not-do list and the review criteria each asset is checked against.', duration: '3–5 days' },
      { title: 'Prompt and pipeline setup', detail: 'Reusable configurations so the hundredth asset matches the first.', duration: '1 week' },
      { title: 'Production with review', detail: 'Assets generated, reviewed against the criteria, and recorded with their provenance.', duration: 'Ongoing' },
      { title: 'Rights and delivery', detail: 'A documented licensing position for what may be published and what may not.', duration: 'Per batch' },
    ],
    faq: [
      { q: 'Can we use the images commercially?', a: 'Every delivered asset comes with a documented rights position. Where a model or source carries a restriction, we say so and you get an asset you can actually publish, or a clear statement of the limit.' },
      { q: 'Will the images look consistent?', a: 'Yes, because consistency is enforced by a stored configuration and a review checklist rather than by memory. That is the difference between a brand and a folder of images.' },
      { q: 'What about likeness and real people?', a: 'We do not generate a real identifiable person without their consent. Where a brief needs a person, we plan for it explicitly rather than generating a plausible stranger.' },
      { q: 'Do you replace our photographer?', a: 'No. Generation covers volume and variation. Anything requiring a real place, a real product or a real person is still a job for a photographer.' },
    ],
    engagement: {
      startingPoint: 'A visual brief with an explicit review rubric.',
      typicalRange: 'A repeatable production pipeline in 2–4 weeks.',
      commercialModel: 'Setup fixed fee, then per-batch production.',
    },
    visual: { gradient: ['#DB2777', '#FC5400'], motif: 'frames', alt: 'Overlapping frames suggesting a consistent set of generated assets.' },
  },

  'voice-conversational-ai': {
    audience: {
      fit: [
        'Your customers speak Bangla, or mix Bangla and English, and existing tools handle neither well',
        'Calls arrive in volume and most are the same handful of questions',
        'You need a clean handover to a human the moment a call gets difficult',
      ],
      notFit: [
        'Every call is genuinely unique and needs a person from the first word',
        'There is no agreed script or knowledge base to answer from',
      ],
    },
    process: [
      { title: 'Conversation design', detail: 'The intents worth handling, the escalation points, and what the system must never say.', duration: '1–2 weeks' },
      { title: 'Speech pipeline', detail: 'Bangla-first speech recognition and synthesis chosen for your audio conditions, not a benchmark.', duration: '2–3 weeks' },
      { title: 'Knowledge grounding', detail: 'Answers built from your documents and scripts, with a refusal path when the answer is not known.', duration: '2 weeks' },
      { title: 'Pilot on real calls', detail: 'Live calls with a human monitoring, reviewed daily, before any unattended rollout.', duration: '2–4 weeks' },
    ],
    faq: [
      { q: 'Does it handle mixed Bangla and English?', a: 'That is the common real case and the speech pipeline is selected to handle code-mixing. It is tested on your actual call recordings during the pilot, because Bangla ASR quality varies enormously by audio condition.' },
      { q: 'What happens when it does not understand?', a: 'It says so and transfers to a person. A confident wrong answer on a voice call is worse than an honest transfer, so refusal is a designed path.' },
      { q: 'Can it take bookings or payments?', a: 'It can take a booking through your systems. Payments over voice are handled cautiously and only with an explicit design conversation about fraud and consent.' },
      { q: 'Do you record calls?', a: 'Only with a disclosed recording policy your callers consent to. The consent flow is part of the design, not an afterthought.' },
    ],
    engagement: {
      startingPoint: 'A conversation-design sprint on your real call recordings.',
      typicalRange: 'An attended pilot runs in 4–8 weeks.',
      commercialModel: 'Design fixed fee, pilot fixed fee, then per-minute or per-seat depending on volume.',
    },
    visual: { gradient: ['#0EA5E9', '#22D3EE'], motif: 'wave', alt: 'A waveform with a branch where the call hands over to a person.' },
  },

  'api-system-integration': {
    audience: {
      fit: [
        'Two systems hold the same information and they disagree',
        'You need an integration that fails loudly rather than dropping records',
        'You want to know which side is the source of truth before you start',
      ],
      notFit: [
        'Both systems already have a maintained, documented connector that works',
        'The real problem is that one of the systems should not exist',
      ],
    },
    process: [
      { title: 'Interface audit', detail: 'Every system, its API capabilities and its actual limits versus its documented ones.', duration: '1 week' },
      { title: 'Source-of-truth agreement', detail: 'For each field, which system owns it. Integration is mostly a disagreement about ownership.', duration: '2–3 days' },
      { title: 'Build with reconciliation', detail: 'The sync plus a reconciliation job that finds and reports discrepancies rather than silently resolving them.', duration: '2–6 weeks' },
      { title: 'Monitoring and alerting', detail: 'Failure detection on both sides, with an alert that names the record and the reason.', duration: '1 week' },
    ],
    faq: [
      { q: 'What if the API has no webhooks?', a: 'Then the integration polls, with the polling interval chosen to match how stale the data can afford to be. We say what the latency is rather than hiding it.' },
      { q: 'How do you handle systems that go down?', a: 'Queued writes and retry with backoff, plus a visible dead-letter list. Nothing is dropped; failures wait and are reported.' },
      { q: 'What about duplicate records?', a: 'Reconciliation is part of the build, not a cleanup you do later. The reconciliation job keeps finding duplicates after launch.' },
      { q: 'Can you integrate with a legacy system with no API?', a: 'Sometimes, through a file exchange or a database view. It is slower and more brittle, and we say so before you commit rather than after.' },
    ],
    engagement: {
      startingPoint: 'An interface audit with a per-field ownership map.',
      typicalRange: 'A verified integration is typically 3–8 weeks.',
      commercialModel: 'Fixed price per integration, with reconciliation included rather than extra.',
    },
    visual: { gradient: ['#334155', '#0EA5E9'], motif: 'nodes', alt: 'Two node clusters joined by a path with a reconciliation checkpoint.' },
  },

  'data-intelligence-analytics': {
    audience: {
      fit: [
        'Several dashboards disagree about the same number',
        'You need to know how each figure is calculated, not just what it says',
        'The people making decisions cannot get an answer without asking an analyst',
      ],
      notFit: [
        'You have no data collected yet — instrumentation comes first',
        'You need a data warehouse built from a dozen sources — that is the larger platform project',
      ],
    },
    process: [
      { title: 'Metric definition', detail: 'One written definition per metric, agreed by the people who use it. Most disagreements end here.', duration: '1 week' },
      { title: 'Pipeline and model', detail: 'The path from source to figure, with the transformations explicit and tested.', duration: '2–5 weeks' },
      { title: 'Semantic layer', detail: 'The definitions expressed once, in code, so every tool uses the same number.', duration: '1–2 weeks' },
      { title: 'Access and training', detail: 'Self-serve access with row-level permissions, and training on reading the numbers honestly.', duration: '1 week' },
    ],
    faq: [
      { q: 'Why do our reports disagree?', a: 'Almost always because the same word means different things in different tools — "active customer" defined three ways. The metric-definition stage resolves this before any dashboard is built.' },
      { q: 'Can we trust the numbers?', a: 'You can trace every number to its definition and its source. Trust comes from being able to check, not from a green tick.' },
      { q: 'Do we need a data warehouse?', a: 'Not for a first version. A semantic layer over your existing sources often fixes the disagreement. A warehouse is the right move when volume or source count demands it.' },
      { q: 'Can non-technical staff use it?', a: 'Yes — that is the point of the semantic layer. They ask a question in plain language and get an answer that uses the agreed definitions.' },
    ],
    engagement: {
      startingPoint: 'A metric-definition workshop producing one written definition per metric.',
      typicalRange: 'A trusted reporting layer is typically 4–10 weeks.',
      commercialModel: 'Fixed price per phase; definitions workshop credited against the build.',
    },
    visual: { gradient: ['#0891B2', '#00309C'], motif: 'chart', alt: 'A chart whose every bar traces back to a labelled definition.' },
  },

  'cloud-devops-engineering': {
    audience: {
      fit: [
        'Deploying takes a person who knows the undocumented steps',
        'You cannot answer "what changed?" or "roll it back" without a scramble',
        'You need to find out a service is down before your customers tell you',
      ],
      notFit: [
        'You run a single static site on a managed host — that is already solved',
        'There is no application yet to deploy',
      ],
    },
    process: [
      { title: 'Infrastructure audit', detail: 'What exists, what is documented, and the gap between the two. Usually a large gap.', duration: '1 week' },
      { title: 'Reproducible environments', detail: 'Development, staging and production built from the same definition, so they cannot drift.', duration: '2–3 weeks' },
      { title: 'Pipeline and rollback', detail: 'Every change deployed the same way, with a tested rollback that is exercised, not just documented.', duration: '2 weeks' },
      { title: 'Observability', detail: 'Metrics, logs and alerts that name the failing thing, wired to whoever is on call.', duration: '1–2 weeks' },
    ],
    faq: [
      { q: 'Can you work with our existing setup?', a: 'Yes. Most engagements start by making what you have reproducible rather than replacing it. A rewrite is a cost you do not need by default.' },
      { q: 'How fast is a rollback?', a: 'Measured, and it is a number in the handover document rather than an aspiration. A rollback that has never been run is not a rollback.' },
      { q: 'Do you lock us into a cloud?', a: 'No. Container-based deployments run on any major provider and on your own hardware. Where a managed service gives real value, we say what the exit cost is.' },
      { q: 'What about security?', a: 'Secrets management, least-privilege roles and dependency scanning are part of the baseline, not an add-on. A pipeline that ships fast but leaks credentials is not an improvement.' },
    ],
    engagement: {
      startingPoint: 'An infrastructure audit with a documented gap list.',
      typicalRange: 'A reproducible pipeline with observability in 4–8 weeks.',
      commercialModel: 'Fixed price per phase, or a retained on-call agreement after handover.',
    },
    visual: { gradient: ['#1E293B', '#3B82F6'], motif: 'cloud', alt: 'Identical environment blocks fed from one pipeline definition.' },
  },
}
