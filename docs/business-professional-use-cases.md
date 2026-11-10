# Everyday business and professional tasks — proposal validation

Date: 2026-11-07 · Evidence: public-source research and scenario walkthroughs; no observed user sessions or runtime validation

## Research and its limits

- **[OECD, Generative AI and the SME Workforce (2025)](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/11/generative-ai-and-the-sme-workforce_83bafdfb/2d08b99d-en.pdf):** survey of 5,232 SMEs in seven countries, fielded in 2024. It identifies marketing/sales as a common application and more use for simple, one-off tasks than complex recurring work. This supports starting with familiar tasks, not a presumption that beginners want automation setup. It is not an Argentine demand study.
- **[Thomson Reuters, AI in Professional Services (2026)](https://www.thomsonreuters.com/content/dam/ewp-m/documents/thomsonreuters/en/pdf/reports/2026-ai-in-professional-services-report.pdf):** describes professional uses including research, summarization, review and drafting. Its sectors include legal, tax/accounting, risk and government; it does not prove demand across every profession. It is a vendor-published report.
- **[NN/g, How AI Literacy Shapes GenAI Use (2026)](https://www.nngroup.com/articles/ai-literacy/):** qualitative observations distinguish expressing a useful request from evaluating an answer; beginners may ignore onboarding text and struggle with tool choice. This supports prepared tasks, contextual help and visible sources rather than lengthy introductory instruction.

The specific scenarios below are Fyso product hypotheses derived from these task families and ordinary work situations. They are not testimonials, measured demand, or validated Fyso capabilities. Labels and journeys are illustrative product design, not implemented UI copy.

## What someone in a company might want to solve

| ID / person | Everyday request | Starting material → useful result | Simplest proposed journey | Reusable foundation / integration still to check | Fit |
|---|---|---|---|---|---|
| B1 Sales assistant | Prepare a quote from these notes | Notes, price list, company template → editable proposal with missing terms marked | Provide files → review draft → adjust wording | Document skills, template handling and editable output | First; use supplied prices, no invented totals |
| B2 Owner or purchasing worker | Compare these supplier offers | Two or three offers → comparable costs, delivery, exclusions and questions | Provide offers → inspect referenced comparison → choose what matters | Document reading and table output; units/taxes need consistent comparison | First |
| B3 Customer service worker | Help me answer this complaint | Customer message and company policy → reply draft | Paste message/policy → get draft → adjust tone | Drafting and source context; no inbox connection needed initially | First; sending remains separate |
| B4 Shop owner | Prepare this week's promotion | Product details, actual prices and an existing brand example → editable copy for selected channel | Supply product information → select channel → revise copy | Writing/design skills; image output is an additional capability | First; initial version uses text |
| B5 Administrator | Turn these meeting notes into follow-ups | Pasted notes → actions, owners and explicit dates or missing assignments | Paste notes → review task table → export | Summarization and table/document generation; task-system writes later | First; no recording/transcription promise |
| B6 Team supervisor | Explain our process to a new employee | Existing procedure → checklist and plain-language guide | Provide procedure → choose guide/checklist → edit | Document skills and supplied source material | First; limited to provided procedure |
| B7 Owner | Tell me what changed in sales | Known-format export or authorized Biz data → checked comparisons and short explanation | Provide export or use one connection → choose period → inspect figures | Deterministic spreadsheet calculations or Biz tools; schema/freshness checks needed | Later; clean data makes the difference |
| B8 Collections administrator | Help me follow up overdue invoices | Current invoice/payment export → draft follow-up list and messages | Provide current data → verify balances → review drafts | Spreadsheet operations and drafting; dates, payments and balances must reconcile | Later; no autonomous collections or assumed live balances |
| B9 Operations worker | Answer questions about our internal procedures | Approved procedure set → answers linked to relevant passages | Ask a question → inspect source → refine | Document retrieval; persistent indexing, access and refresh need checking | Later; start with B6 before a company-wide knowledge base |
| B10 Owner | Send me a weekly business brief | A previously useful report with a stable source → recurring result | Run once → choose schedule → view last result/stop | Existing Dagu schedule/history plus stable connector | Later; schedule after manual usefulness is established |

## What an independent professional might want to solve

| ID / person | Everyday request | Starting material → useful result | Simplest proposed journey | Reusable foundation / integration still to check | Fit |
|---|---|---|---|---|---|
| P1 Consultant | Turn my client notes into a proposal | Notes, service template, supplied scope and fees → editable engagement draft | Provide notes/template → review scope → edit | Same foundation as B1; fewer setup choices with reusable template | First |
| P2 Architect or engineer | Compare client briefs and prepare clarification questions | Written requirements → discrepancies, unanswered questions and meeting checklist | Provide text documents → inspect comparison → refine | Same comparison skills as B2; no drawing/CAD or engineering calculation promise | First for text material |
| P3 Accountant | Help me ask my client for missing paperwork | Accountant-supplied checklist and received-file list → missing-item list and email draft | Provide lists → verify missing items → edit request | Table comparison and drafting; user supplies applicable requirements | First for administration; no tax/legal determination |
| P4 Lawyer | Summarize this agreement and show the passages | Supplied agreement → structured summary and questions for professional review | Provide agreement → inspect clause references → request changes | Document skills and reliable passage references | First for source-bound summary; legal research/advice needs separate evaluation |
| P5 Trainer | Prepare a workshop from my material | Own notes, audience and duration → outline, exercises and slide draft | Supply material → specify audience/duration → revise output | Document/presentation skills and editable export | First; slide quality and export need proof |
| P6 Freelancer | Prepare my next client meeting | Pasted previous notes and project update → agenda and open questions | Provide notes → get agenda → edit | Same foundation as B5; calendar/email connections optional later | First |
| P7 Recruiter or HR consultant | Turn an agreed role brief into interview preparation | Role brief and interview template → job-description draft and question guide | Provide brief → review missing requirements → edit | Writing/document skills | First; no automatic candidate ranking or hiring decisions |
| P8 Independent professional | Organize receipts for my accountant | Receipt images/PDFs → extracted table with uncertain fields flagged | Provide files → inspect extraction → correct/export | OCR, structured extraction and spreadsheet export | Later; extraction confidence and correction UI require proof |

## What the cases validate

The proposal fits **assisted preparation of ordinary work artifacts**: drafts, comparisons, summaries, lists and guides. B1/P1, B2/P2, B3 and B5/P6 reuse the same foundations while giving people recognizable ways to begin.

This is documentation-based fit, not observed usability. The current proposal still needs these changes in emphasis:

1. Present a small set of work requests before capability packs. “Prepare a proposal” is a clearer entry than selecting an assistant and its document tools.
2. Offer a file/paste starting point. It makes a first useful result possible without mandatory CRM, inbox or calendar authorization.
3. Preserve material through follow-up edits. Asking again for files or context breaks the proposed simplicity even if every individual tool works.
4. Keep a clear output path. An editable proposal or exportable table is more concrete than a long chat answer; verify actual output support before promising a file type.
5. Make sources and missing inputs easy to inspect. A polished artifact with invented fees, balances or citations fails its purpose.
6. Put software building, integration management and development-method skills behind the scenes for this audience. They support delivery, but are not the primary home-screen offer.

## Recommended starting offer

Use four initial entries, subject to native compatibility checks:

- **Prepare a proposal** — B1/P1.
- **Compare documents or offers** — B2/P2.
- **Draft a reply** — B3, with user-supplied context.
- **Organize notes and next steps** — B5/P6.

A short “Describe what you need” entry can remain available. The menu is an orientation aid, not a rule that users must classify every request. Use contextual suggestions rather than a long training introduction.

Fyso's proposed added value over generic chat is the continuity of a prepared task: reusable company templates, selected procedures, material kept for edits, usable outputs and optional connections/scheduling when they help. Where a user's current application already completes the task more simply, use or link that native feature; avoid recreating it just to add a Fyso screen.

## Scenarios to defer

Live collection actions, autonomous inbox management, bookkeeping decisions, legal/tax conclusions, engineering calculations and company-wide search introduce different data and professional requirements. They are useful possibilities, but a simple-looking button does not establish a simple or reliable experience. Revisit them as specific tasks rather than broad promises.

## How to validate simplicity next

Use the [Simple Experience Reviewer](agents/simple-experience-reviewer.md) for a fresh document walkthrough. Then observe actual target users performing one task with their ordinary material: where they hesitate, what they must repeat, whether they can use the result and what happens when a file is unsupported. Research and agent review cannot establish those observed outcomes.
