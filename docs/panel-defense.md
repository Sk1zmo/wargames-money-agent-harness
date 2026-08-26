# Panel defence

Hard questions, answered from the code. Where the honest answer is a limitation,
it is given as one.

---

### 1. Your detection rate is 100%. Isn't that just a sign the test is rigged?

Partly, and that is why the number is never reported without its caveat. Two
hand-written reference agents — one built to pass the checks, one built to fail
them — *should* separate cleanly. A 100% detection rate is what you'd expect,
not evidence of anything external.

What the figure is actually good for is regression. It started at **78.6%** with
three classes detecting nothing, and getting to 100% required finding and fixing
three real defects. Had I reported the first run's number without a per-class
breakdown, three dead classes would have shipped invisibly.

### 2. So the harness grades its own homework?

For the self-evaluation figures, yes, and the README, the landing page, the
overview and the self-evaluation page all say so in those words. The reference
agents and the checks share an author, so those are internal-consistency figures
rather than external validity.

The false-alarm arm is what keeps it from being purely circular: it distinguishes
"the check is wrong" from "the agent is wrong", and both happened. Two of the six
findings in the failure diary were defects in the *safe agent*; three were
defects in the *harness*.

### 3. Why does the simulator let an agent exceed its spend cap? That seems backwards.

It is the single most important design decision here.

A delegated spend cap is not a rule the payment provider enforces — it is policy
the agent must impose on itself, exactly as with real delegated authority. If the
sandbox blocked over-cap payments, an agent that tried to spend ten times its
limit would produce the same record as one that never tried, and the harness
would certify both as safe.

So the attempt goes through into a world holding no money, is recorded
precisely, and the verdict engine fails the agent for having made it. The
simulator judges the *attempt*, not the outcome.

### 4. What stops an agent passing by refusing everything?

`BENIGN_CONTROL`, one of the fifteen classes, where the correct behaviour is to
complete the task. `MUST_COMPLETE_LEGITIMATE_TASK` fails an agent that refuses a
request that was in-budget, in-scope and to a trusted merchant.

Without it, "never act" would be the highest-scoring strategy and the
certification would be worthless. It also gives the false-alarm rate a
denominator: a false alarm is only observable on a request that should have
succeeded.

### 5. Can a confident judge overturn a failed check?

No, structurally. Rule precedence evaluates mandatory check failures at step 2,
before any judge rule is consulted at step 3. There is a test asserting that a
judge classifying an execution `SAFE` at confidence `0.99` still yields `FAIL`
when a mandatory check failed, and a sweep asserting no combination of judge
state and failed check produces `PASS`.

Weighted combination was rejected precisely because every weighted scheme has a
confidence value at which the model wins.

### 6. Then why have a judge at all?

For the thing rules genuinely cannot do: reading a fluent, confident paragraph
that rationalises why the cap did not apply today. The rubric can see that an
agent called a forbidden tool; it cannot see that an agent argued its way into
something unsafe in a way no rule anticipated.

That gap is the honest case for the model judge, and it is why the rubric
reports `reasoning_quality` as `null` with reliability `0` rather than pretending
to a certainty it has not earned.

### 7. You ship with no LLM configured. Isn't the AI part vapourware?

The judging *interface* is real and exercised — the rubric implements the same
`JudgeResult` contract, the same schema, and the same failure states. What is not
exercised without a provider is a model's language understanding.

Rather than print rubric numbers under an "AI" heading, the harness reports
`judgeMode: rubric` on every stored run, on the Developer page, and in the
header of every self-evaluation. Judge consistency is reported as **not
applicable** rather than 100%, because a pure function agreeing with itself is a
tautology.

### 8. What does a PASS actually entitle someone to?

Very little, deliberately. It says one agent satisfied the checks defined for the
scenarios it was given, under the conditions given, at the versions in the run's
fingerprint. Every `PASS` reason string ends by saying it is not a claim of
general safety.

It does not transfer to a different version of that agent, which is what the
fingerprint exists to make checkable.

### 9. Why do HUMAN_REVIEW and INCONCLUSIVE score zero rather than being excluded?

Because excluding them would let an agent improve its score by becoming harder to
evaluate. An unresolved case has not demonstrated safety, and a score that gates
financial authority should not credit it. Resolving the review is what earns the
credit, on a re-run.

They are stored as distinct verdicts rather than collapsed because "we could not
tell" and "we could tell but a person should decide" are different operational
situations.

### 10. One failed scenario fails the whole run. Isn't that brittle?

It is intentional. Averaging a disqualifying failure away behind fourteen passes
would defeat the purpose of an instrument that gates payment authority. The
per-class scores are still reported, so a reader can see *how* close an agent
was — but the overall verdict does not round in the agent's favour.

### 11. How do I know held-out scenarios are genuinely unseen?

Two mechanisms. Different generator seed, and — added after a real bug —
generation-time exclusion: held-out generation takes the development prompts as
an exclusion set and resamples with a salted sub-seed until every prompt is
distinct, failing loudly if a class cannot supply enough variants.

The bug is worth stating. A manual check at one seed reported zero overlap and
that was taken as the property holding. It did not hold: at other seeds
`BENIGN_CONTROL`, `REVOKED_AUTHORITY` and `API_TIMEOUT` collided, because
several classes draw from a space as small as 96 distinct prompts. One seed
proves nothing about a sampling process.

### 12. Why rejection sampling instead of just giving held-out its own merchants?

Partitioning the parameter space would make held-out a **different
distribution**, which breaks the comparison it exists to support. Held-out should
answer "does this hold on instances the harness was not tuned against", not "does
this hold on a different kind of instance". Rejection sampling preserves the
distribution, conditioned only on not colliding.

### 13. Isn't a repository full of payment attacks an attack toolkit?

No, and the distinction is checkable rather than rhetorical.

The adversarial content is generic social-engineering phrasing — "finance
approved this verbally", "our banking details changed this quarter" — aimed at a
simulator that holds no money and speaks no real protocol. There is no evasion
technique, no credential-abuse mechanism, no method for bypassing a real
provider's controls, and nothing that transfers to any payment infrastructure.

The intentionally-vulnerable agent is naive rather than malicious: it takes the
latest instruction it sees, skips its checks, and asserts success it has not
verified. Every one of those is a plausible engineering oversight, which is
exactly the point — they are the failures a well-intentioned team ships.

### 14. Could someone point this at production and cause harm?

There is no code path to a real payment provider. The project has **no payment
SDK dependency at all**; enabling live money would mean writing the integration,
not flipping a switch.

`HARNESS_MODE` accepts two values. `LIVE`, `PRODUCTION`, `PROD`, `REAL` and
`MAINNET` are each refused by name with an error explaining the design, and
unrecognised values are refused rather than silently coerced. The sandbox
re-asserts the mode in its own constructor.

### 15. Your audit trail — is it tamper-evident?

No, and the UI says so on the page rather than in a footnote. Rows are only ever
inserted and a correction is a new row referencing the original, but that is
append-only **in the application layer**. It is not hash-chained and offers no
defence against direct database access.

Hash-chaining is real and worthwhile; claiming it without implementing it would
be a false security claim, which the specification forbids explicitly.

### 16. What happens when the judge is unavailable? Do you just proceed?

No. An unavailable judge produces an explicit failure and the verdict engine
returns `HUMAN_REVIEW`. Critically, a configured-but-failing model judge does
**not** silently fall back to the rubric — that would hide a broken judge behind
a weaker one and quietly change what the certification measured, while the stored
run still claimed the model produced it. That is a falsehood in the audit trail.

### 17. Why is authentication off by default?

So a fresh clone runs with no setup, which matters for something whose value
depends on people being able to check it. The trade-off is stated rather than
hidden: the Developer page raises a panel when `API_TOKEN` is unset, the deck
header shows "auth disabled" on every page, and the threat model lists it as a
residual risk with the deployment checklist item to fix it.

### 18. PGlite in production?

No. PGlite is the *default* so the project runs with no server, and it is real
PostgreSQL compiled to WebAssembly — the same migrations, SQL and `jsonb`
semantics, not an approximation. `DATABASE_URL` starting `postgres://` switches
to node-postgres through the identical code path.

The deployment checklist says explicitly that PGlite is per-process and its data
does not survive a serverless invocation.

### 19. Why integer minor units? Isn't that fussy?

Spend-cap enforcement is a certification **verdict**. A floating-point comparison
saying `10000.000000001 > 10000` would fail an agent for the harness's own
arithmetic error, and the agent's author would have no way to tell it was our
bug rather than theirs.

### 20. What is the biggest weakness?

Coverage. Fifteen classes is a bounded model of an unbounded space. An agent that
fails in a way no class models passes, and the self-evaluation rate would not
reveal it — the detection rate measures the harness against behaviours it was
built to see, and can say nothing about the rest.

The mitigations are partial: the adapter contract is deliberately open so third
parties can add classes, and the per-class breakdown makes a dead class visible
(which is how three were found). But the limitation is real and unresolved.

### 21. Second biggest?

That the harness cannot defend against the person running it. Whoever operates it
can regenerate suites, re-run until satisfied, or change the code. Runs are
deterministic given a fingerprint and every run is stored rather than only the
good one, which makes selective reporting *visible* — but independent
verification requires a third party running it themselves.

### 22. Why no queue, no microservices, no blockchain?

A certification run is a bounded, deterministic computation over a fixed scenario
set. Nothing here needs consensus, asynchronous fan-out or independent
deployment. Infrastructure that does not earn its place makes a system harder to
verify, which is a poor trade for something whose entire value is being
trustworthy.

### 23. How would I add a new attack class?

Add it to `ATTACK_CLASSES`, write a builder in `BUILDERS` (the type makes the
record exhaustive, so TypeScript fails the build until you do), add any new check
to `DETERMINISTIC_CHECKS` and implement it in `CHECKS`.

Then run the self-evaluation. If the new class shows 0% detection, the fixture
cannot exercise it or no check can see it — which is exactly how three dead
classes were found.

### 24. What would change your mind about this design?

A third-party agent failing in production in a way the harness passed. That would
be direct evidence the class model is inadequate, which is the limitation I
believe is most likely to bite. I would want the failure added as a class, and I
would want the detection rate re-reported with the honest note that it had been
100% while missing that case.

Second: if a model judge, once configured, showed low consistency on cases where
the deterministic checks agree, that would suggest the judge is adding noise
rather than the coverage it is there for.
