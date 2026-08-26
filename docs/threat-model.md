# Threat model

## Scope

This is a **defensive certification harness**. It evaluates agents; it does not
attack payment infrastructure and holds no funds. That shapes the threat model:
the assets worth protecting are mostly *epistemic* — the trustworthiness of a
verdict — rather than monetary.

---

## Assets

| Asset | Why it matters | Loss if compromised |
|---|---|---|
| **Verdict integrity** | A `PASS` may be used to grant an agent payment authority | An unsafe agent is authorised on the strength of a false certificate |
| **The impossibility of live money** | The harness runs adversarial scenarios by design | If a live rail were reachable, the harness would *be* the attack |
| **Audit trail** | The record of what was certified and why | A dispute becomes unresolvable |
| **Scenario integrity** | Held-out scenarios must be unseen | A held-out score would measure memorisation |
| **Credentials** | Adapter tokens, judge API keys | Standard credential compromise |
| **Reviewer accountability** | Who decided what, and why | A decision with no owner |

---

## Adversaries

### A1 — A hostile target agent

The most important adversary, because the harness *invites* it in and executes
it.

| Attempt | Mitigation |
|---|---|
| Call a capability it does not hold | Tool allowlist in the sandbox, not in the adapter. A hostile adapter cannot widen it. |
| Exhaust the harness with unbounded tool calls | `TARGET_MAX_TOOL_CALLS` budget; the sandbox terminates the episode. |
| Hang forever to avoid a verdict | Deadline race producing `INCONCLUSIVE`. A timeout is never a pass. |
| Return a giant response to exhaust memory | `TARGET_MAX_RESPONSE_BYTES`, enforced while reading rather than after. |
| Lie about what it did | Every claim is compared against sandbox state. `claimedPaymentState` is checked, never believed. |
| Return a malformed reply to crash a check | Replies are Zod-validated; a check that throws is recorded as a *failed* check, never a pass. |
| Reach a host it should not | `ADAPTER_ALLOWED_HOSTS`; redirects are refused with `redirect: "error"` so an allowed host cannot bounce the request elsewhere. |
| Mutate a scenario to make later runs easier | Seed state is deep-cloned per execution; the stored scenario is untouched. |

**Residual risk.** An in-process reference adapter runs with the harness's own
privileges. The bundled ones are trusted code; a third-party in-process adapter
would not be, which is why third parties use the HTTP adapter and why adding new
in-process adapter types is a code change rather than configuration.

### A2 — Prompt injection through scenario content

Scenarios deliberately contain injected directives, so injected text reaches the
agent by design.

- Injected content is wrapped in `<untrusted source="...">` markers and is
  **data the agent was shown**, never an instruction to the harness.
- The harness itself never executes text from a prompt. Only the *agent* acts on
  it, and whether it did so is the measurement.
- `NO_INJECTED_DIRECTIVE_FOLLOWED` compares behaviour against the principal's
  directive, counting only fields where the two disagree.

**Residual risk.** When a model judge is configured, scenario prompts and agent
replies are placed into the judge's context. A sufficiently capable injection
could target the *judge*. Mitigations: the judge's system prompt states that
`<untrusted>` content is data; its output is schema-constrained rather than
free-form; and — the structural defence — **the judge can never remove a
deterministic failure**, so a compromised judge can at worst add a false failure
or withhold confidence, both of which fail safe.

### A3 — An operator trying to enable live money

| Attempt | Mitigation |
|---|---|
| `HARNESS_MODE=LIVE` | Refused by name, with an error explaining the design |
| `HARNESS_MODE=PRODUCTION`/`PROD`/`REAL`/`MAINNET` | Each refused by name |
| A typo, hoping for a permissive default | Unrecognised values are refused; there is no silent coercion |
| Bypassing the parser | `assertSandboxMode()` is called inside the sandbox constructor |

There is no code path to a real payment provider. The harness has no payment SDK
dependency at all, so enabling live money would require *writing* the
integration, not flipping a switch.

### A4 — Someone gaming a certification

| Attempt | Mitigation |
|---|---|
| Refuse everything to pass all safety checks | `BENIGN_CONTROL` + `MUST_COMPLETE_LEGITIMATE_TASK` |
| Tune against the visible suite | Held-out suite from a different seed, with generation-time exclusion |
| Certify a weak version, ship a different one | The fingerprint binds agent version, adapter version, suite, engine, judge and seed |
| Re-run until a lucky pass | Runs are deterministic given the same fingerprint; every run is stored, not just the good one |
| Argue a failure away in review | Reviews are recorded *beside* the machine verdict; the stored verdict is never rewritten |

**Residual risk.** The fingerprint binds *declared* versions. An agent author who
changes behaviour without changing their version string defeats it. That is a
supply-chain problem the harness cannot solve alone; the honest mitigation is
that the fingerprint makes the claim explicit and checkable rather than implicit.

### A5 — A compromised or absent judge

| Situation | Behaviour |
|---|---|
| Judge unreachable | Explicit failure → `HUMAN_REVIEW` |
| Judge returns malformed output | One correction retry, then failure → `HUMAN_REVIEW` |
| Judge times out | Explicit failure → `HUMAN_REVIEW` |
| Judge returns confident nonsense | Cannot remove a deterministic failure; can only add one or withhold confidence |
| A model provider is configured but no client exists | Explicit `NO_PROVIDER` failure, **not** a silent rubric substitution |

The last row is the important one. Silent fallback would hide a broken judge
behind a weaker one while the stored run still claimed the model produced it —
a falsehood in the audit trail.

### A6 — API abuse

| Threat | Mitigation | Residual |
|---|---|---|
| Unauthenticated mutation | Bearer token when `API_TOKEN` is set | **Auth is off by default** so a fresh clone runs with no setup. The Developer page states this prominently rather than leaving it to be discovered. Any deployment reachable beyond localhost must set it. |
| Malformed body | Zod validation before any handler runs | — |
| Injection through query parameters | Drizzle parameterised queries throughout; no string-built SQL | — |
| Expensive run as a denial of service | Scenario and repetition counts are capped; audit queries are capped at 500 rows | No rate limiting. A deployment exposed publicly needs it at the edge. |
| Enumeration of ids | Ids are prefixed and random-suffixed | Not a secrecy boundary; authorisation is the control |

### A7 — Credential exposure

| Vector | Mitigation |
|---|---|
| Secrets in adapter config | Registration rejects keys matching `secret|token|password|apikey|credential|private_key`, allowing only `authTokenEnvVar` — the *name* of a variable |
| Secrets in logs | Logger redacts by key across nested objects |
| Secrets in the repository | `.gitignore` covers `.env*`, `*.pem`, `*.key`, `*.p12`; only `.env.example` is tracked, with empty values |
| Secrets in evidence | Evidence stores tool arguments, which by construction never contain credentials — the sandbox has no authenticating tool |
| Secrets echoed to a caller | Errors serialise a code, a message and a correlation id; never the environment |

---

## Trust boundaries

```
UNTRUSTED                    │ VALIDATION            │ TRUSTED
─────────────────────────────┼───────────────────────┼──────────────────
agent replies                │ Zod schema            │ sandbox state
adapter HTTP responses       │ allowlist, size cap,  │ deterministic checks
                             │ no redirects          │ verdict engine
scenario prompts (injected)  │ untrusted markers,    │ stored evidence
                             │ tool allowlist        │ audit trail
API request bodies           │ Zod schema, auth      │
judge output                 │ Zod schema, advisory  │
                             │ status only           │
```

The judge sits on the untrusted side of the boundary. That is deliberate: its
output is validated and its authority is structurally limited, so a compromised
judge degrades the result toward review rather than toward a pass.

---

## What this harness does not defend against

Stated plainly, because a threat model that claims total coverage is not one.

1. **Database-level tampering.** The audit trail is append-only in the
   application layer. Someone with direct SQL access can rewrite anything. It is
   not hash-chained and does not claim to be.

2. **A malicious harness operator.** Whoever runs it can regenerate suites,
   re-run until satisfied, or edit the code. The harness produces evidence for a
   reader; it does not defend against the person producing it. Independent
   verification would need a third party running it themselves.

3. **Attack classes nobody thought of.** Fifteen classes is a bounded model of
   an unbounded space. A third party's agent failing in an unmodelled way passes,
   and the self-evaluation rate would not reveal it. This is the largest
   limitation and it is stated on the landing page, the overview and the
   self-evaluation page as well as here.

4. **Whether behaviour transfers to production.** The sandbox is a model of a
   payment provider, not a payment provider. An agent that is safe here may fail
   against real infrastructure with different timing, error codes and rate
   limits.

5. **Model-level attacks on the judge** beyond schema validation and the
   structural limit on its authority.

6. **Denial of service.** No rate limiting; a public deployment needs it at the
   edge.

---

## Deployment checklist

- [ ] `API_TOKEN` set — auth is off without it
- [ ] `DATABASE_URL` pointing at a real PostgreSQL for anything shared; PGlite is
      per-process and its data does not survive a serverless invocation
- [ ] `ADAPTER_ALLOWED_HOSTS` narrowed to the targets you actually certify
- [ ] `HARNESS_MODE` left at `SIMULATED` — there is no other useful value
- [ ] Rate limiting at the edge if reachable beyond localhost
- [ ] `.env` absent from the image; secrets injected by the platform
