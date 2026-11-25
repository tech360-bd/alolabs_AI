# Legal address verification — for owner confirmation

**Status:** ANALYSIS ONLY. No legal text has been changed. Every item below needs an
answer from the company owner before anything is edited.

## The reported inconsistency

| Statement | Where it appears |
|---|---|
| "registered in Harrisonville, Missouri, United States" | `/site/privacy` clause 1; `/site/terms` clause 1 |
| "Head office in Harrisonville, Missouri" | `/site/about`, `/site/contact`, `/site/press` |
| "Built in Bangladesh" | Dark homepage stat chip; `PUBLIC_COMPANY.addressCountry: 'BD'` |

## Assessment: these do not necessarily conflict

As the brief notes, **place of registration and place of delivery are different facts**.
A US-registered entity can build in Bangladesh, and a site that states both is more
credible than one that picks a single location and lets visitors guess.

The current copy is consistent *if and only if* the following is true:

- The company is legally registered in Missouri, **and**
- Engineering/delivery genuinely happens from Bangladesh.

Both appear to be the case from the repository: `src/lib/brand/tokens.ts` holds the
letterhead address (`117 S Lexington St Ste 100, Harrisonville, MO 64701`), and
`src/lib/enterprise-roadmap.ts` records `USA / Bangladesh`.

## What is NOT verifiable from this repository

The repository cannot confirm:

1. **The exact legal entity name.** `COMPANY.legalName` is `'ALO Labs'` and
   `COMPANY.entity` is `'SOLE MBR'` — the latter is a letterhead abbreviation, not a
   registered entity name. A privacy policy that names an entity should name it exactly.
2. **That the Missouri address is current and is the registered agent address** rather
   than a mailing/virtual office.
3. **The governing law** for terms of service — `/site/terms` clause 1 carries an
   existing `OWNER APPROVAL` comment saying this must be confirmed with counsel.
4. **Whether a Bangladesh entity also exists.** If it does, contracts, invoicing and
   data-processing disclosures may need to name it.

## Exact text requiring confirmation

### 1. `src/components/site/pages/privacy.tsx` — clause 1

> ALO Labs ("ALO Labs", "we", "us") is a technology company registered in
> Harrisonville, Missouri, United States. Our contact address is 117 S Lexington St
> Ste 100, Harrisonville, MO 64701, and you can reach us at info@alolabs.net or
> +1 (347) 433 1200.

**Questions:** Is "registered in" accurate, or should it read "headquartered in"?
What is the exact registered entity name?

### 2. `src/components/site/pages/terms.tsx` — clause 1

> "ALO Labs", "we" and "us" refers to the technology company headquartered at 117 S
> Lexington St Ste 100, Harrisonville, MO 64701.

**Questions:** Same entity-name question. The clause currently specifies no governing
law at all; counsel should add one.

### 3. `src/lib/brand/agentos-3d.ts` — `PUBLIC_COMPANY`

```ts
/** Bangladesh base, stated the same way on the contact page. */
addressCountry: 'BD',
```

**Question:** This feeds `organizationSchema` structured data (used by search engines
for the Organization node). Should `addressCountry` be `US` (registered) or `BD`
(delivery)? Structured data should describe the registered entity, so this is likely
wrong today — but it is a legal-input question, not a styling one.

### 4. `src/app/site/about/page.tsx` metadata and `src/components/site/pages/about.tsx`

> ... Harrisonville, Missouri.

**Question:** Keep, or rephrase to "US-registered, delivered from Bangladesh"?

## Recommendation

Publish both locations with their roles made explicit — **registered office** vs
**delivery base** — which is what the rebuilt `/site/about` now does:

> "Registered in Harrisonville, Missouri, with delivery built in Bangladesh.
> Registration and delivery are different facts, and we state both rather than
> implying one."

That is defensible and honest regardless of how the legal questions resolve, because it
asserts only that both facts are true. It should still be confirmed by the owner.

**Do not merge legal copy changes until these four questions are answered.**
