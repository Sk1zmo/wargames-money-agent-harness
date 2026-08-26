# Design decisions

What was chosen, what was rejected, and why. Decisions are recorded with their
alternatives so a later reader can tell a deliberate choice from an accident.

---

## 1. The simulator permits delegated-policy violations

**Decision.** The sandbox enforces what a *payment provider* enforces and
deliberately permits what the *agent* is supposed to enforce on itself.

**Rejected.** Blocking every unsafe action at the sandbox boundary.

**Why.** A delegated spend cap is not a provider rule; it is policy the agent
must impose on itself, exactly as with real delegated authority. If the sandbox
silently blocked over-cap payments, an agent that tried to spend ten times its
limit would produce the same record as one that never tried, and the harness
would certify both as safe. The attempt *is* the unsafe behaviour, so the
simulator lets it through into a world holding no money, records it precisely,
and the verdict engine judges the attempt rather than the outcome.

For provider-side rules the attempt is still the signal: a safe agent does not
try to spend against a revoked authority even though the provider would refuse
it. So those are rejected **and** recorded.

---

## 2. Deterministic checks outrank the judge, always

**Decision.** Rule precedence evaluates mandatory check failures before any
judge rule.

**Rejected.** Weighted combination, or letting a high-confidence judge downgrade
a failure.

**Why.** If a model could overturn "this agent paid ten times its cap", the
model would be the safety policy. The specification is explicit that the AI does
not own the final policy, and the only way to guarantee that structurally is
ordering rather than weighting. Weighted schemes always have a confidence value
at which the model wins.

The judge is genuinely useful for the thing rules cannot do — reading a fluent
paragraph that rationalises why the cap did not apply today — so it can *add*
failures (rule 4) and *withhold* confidence (rule 5). It can never subtract one.

---

## 3. A benign control inside a suite of attacks

**Decision.** One of the fifteen classes is a scenario where the correct
behaviour is to complete the task.

**Rejected.** Fourteen adversarial classes only.

**Why.** An all-attack suite has a trivial winning strategy: refuse everything.
An agent that never acts passes every safety check while being useless, and the
harness would report it as perfectly safe. `MUST_COMPLETE_LEGITIMATE_TASK`
catches that.

It is also what makes the false-alarm rate meaningful. A false alarm is only
observable on a request that *should* have succeeded, so without a benign class
the denominator would be empty.

---

## 4. Uncertainty is never a pass

**Decision.** `HUMAN_REVIEW` and `INCONCLUSIVE` are distinct stored verdicts and
score zero.

**Rejected.** Collapsing them into `CONDITIONAL`, or excluding them from scoring.

**Why.** Collapsing them at write time destroys the difference between "we could
not tell" and "we could tell but a person should decide", which are different
operational situations. Scoring them as zero is the conservative choice: an
unresolved case has not demonstrated safety, so it must not contribute to a
score that gates financial authority. Resolving the review is what earns the
credit, on a re-run.

---

## 5. A structured settlement field instead of parsing prose

**Decision.** Agent replies carry `reportedSettlementMinor: number | null`.

**Rejected.** Extracting a total from the response text.

**Why.** Webhook double-counting is only observable if the agent states a number
the harness can compare against the ledger. Scraping it out of prose would make
the check a regex contest whose failures are unattributable — you could never
tell whether the agent was wrong or the parser was. A null means the agent did
not compute a total and the check does not apply, which is honest.

The same reasoning gives `refused`, `escalatedToHuman` and `claimedPaymentState`
their structured form. Where the harness must read prose, it does so with a
guarded pattern and says so in the check's reported reliability.

---

## 6. Rejection sampling for held-out disjointness

**Decision.** Held-out generation takes the development prompts as an exclusion
set and resamples with a salted sub-seed until every prompt is distinct.

**Rejected.** Partitioning the parameter space — giving held-out its own
merchants or amount ranges.

**Why.** Partitioning would make held-out a **different distribution**, which
breaks the comparison it exists to support. Held-out is meant to answer "does
this hold on instances the harness was not tuned against", not "does this hold
on a different kind of instance". Rejection sampling preserves the distribution,
conditioned only on not colliding.

**Also rejected:** relying on a large parameter space. Several classes draw from
a genuinely small one — naming two forbidden tools out of a fixed list yielded 96
distinct prompts over 800 draws — and a birthday collision there is likely rather
than exotic.

---

## 7. PGlite as the default database

**Decision.** `DATABASE_URL` accepts both `postgres://` and `pglite://`, and the
default is PGlite.

**Rejected.** Requiring a PostgreSQL server; SQLite; an in-memory mock.

**Why.** PGlite *is* PostgreSQL, compiled to WebAssembly and running in-process.
The same migrations, the same SQL, the same `jsonb` semantics. A reviewer clones
the repository and runs it with no Docker, no server and no connection string,
while production points at a real cluster through the identical code path.

SQLite was rejected because it would mean two dialects, and a schema that
behaves differently in test from production is a source of the exact bugs this
harness exists to catch.

An in-memory mock was rejected outright: it would make every integration test a
test of the mock.

---

## 8. A rubric judge, and no silent fallback

**Decision.** When no model provider is configured, a deterministic rubric judge
runs. When a model judge is configured but fails, the result is an explicit
failure — it does **not** fall back to the rubric.

**Rejected.** Failing hard with no judge at all; silently substituting the rubric.

**Why.** The harness has to be runnable without an API key, or nobody can
evaluate it. The rubric scores the dimensions a model judge would, using
observable signals rather than language understanding, and reports lower
confidence on the ones it genuinely cannot assess — `reasoning_quality` is
explicitly `null` with reliability `0`, because judging whether stated reasoning
is sound requires reading prose.

Silent fallback was rejected because it hides a broken judge behind a weaker one
and quietly changes what the certification measured, while the stored run still
claims the model judge produced it. That is a lie in the audit trail.

---

## 9. Human decisions recorded beside the machine verdict

**Decision.** `scenario_executions.verdict` is never rewritten. A review is a
separate row.

**Rejected.** Applying the reviewer's verdict to the execution.

**Why.** A certification record whose stored verdict silently becomes whatever
the last reviewer clicked is not an audit trail, it is a rumour. What the harness
concluded and what a person decided about that conclusion are two facts, and both
need to stay readable.

A decision also requires a rationale of at least ten characters. One nobody can
read later carries no information forward, which defeats the purpose of having a
human in the loop.

---

## 10. Integer minor units everywhere

**Decision.** All money is integer paise. No float touches a monetary value.

**Why.** Spend-cap enforcement is a **certification verdict**. A floating-point
comparison that says `10000.000000001 > 10000` would fail an agent for the
harness's own arithmetic error, and the agent's author would have no way to tell.

---

## 11. Append-only audit, described accurately

**Decision.** Audit rows are only ever inserted; a correction is a new row
referencing the original. The UI states that this is application-layer
append-only and **not** cryptographic tamper-evidence.

**Rejected.** Hash-chaining or signing the audit log; claiming tamper-evidence
without implementing it.

**Why.** Hash-chaining is a real and worthwhile property, and it is what a
sibling project in this workspace is for. Implementing it here would be scope
the specification did not ask for. Claiming it without implementing it would be
a false security claim, which the specification forbids explicitly.

So the guarantee is stated exactly as it is: rows are only inserted by the
application layer, and someone with direct database access is entirely
unconstrained by that.

---

## 12. No blockchain, no queue, no microservices

**Decision.** A modular monolith, one repository, one database.

**Why.** Nothing here needs distributed consensus, asynchronous fan-out or
independent deployment. A certification run is a bounded, deterministic
computation over a fixed scenario set. Infrastructure that does not earn its
place makes the system harder to verify, which is a poor trade for something
whose entire value is being trustworthy.

---

## 13. The Python statistics service is optional

**Decision.** Interval estimates are requested from a Python service when one is
configured. When it is not, the result records `unavailable` and the UI shows
point estimates **without** invented error bars.

**Why.** A detection rate of 100% over 42 scenarios carries real uncertainty, and
reporting it bare invites over-reading. But approximating an interval in
TypeScript to avoid an empty field would be worse than saying it is missing.
Point estimates are exact counts over the suite and stand on their own; what is
absent is the uncertainty around them, and that absence is stated.

---

## 14. The vulnerable reference agent is naive, not malicious

**Decision.** The known-unsafe agent follows the latest directive it sees, skips
its authority and cap checks, asserts success from a creation response, and omits
idempotency keys.

**Rejected.** Making it a genuine adversary with evasion techniques.

**Why.** It is a test fixture whose purpose is to exercise the checks, and it
ships in a public repository. Everything it does is a plausible engineering
oversight rather than an attack, so there is nothing reusable in it. A file that
demonstrated real evasion against payment infrastructure would make this an
attack toolkit, which the specification forbids.

The distinction is load-bearing rather than cosmetic: the failures it exhibits
are the ones a well-intentioned team actually ships.
