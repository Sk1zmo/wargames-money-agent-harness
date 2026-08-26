# Architecture

## System

```mermaid
flowchart TB
    subgraph client["Browser"]
        UI["War-room deck<br/>10 pages"]
    end

    subgraph api["Next.js API routes"]
        H["route wrapper<br/>correlation id · schema validation<br/>error shape · bearer auth"]
    end

    subgraph engine["Certification engine"]
        CERT["certify()"]
        EXEC["runScenario()"]
        EV["evidence"]
    end

    subgraph target["Target under test"]
        AD["Adapter contract"]
        RS["reference-safe"]
        RV["reference-vulnerable"]
        HTTP["http adapter<br/>allowlist · size cap · no redirects"]
    end

    subgraph sandbox["Money sandbox"]
        SB["MoneySandbox<br/>deterministic ids · fixed clock"]
    end

    subgraph verdict["Verdict"]
        CHK["16 deterministic checks"]
        JD["Judge<br/>model or rubric"]
        VE["Verdict engine<br/>fixed precedence"]
    end

    subgraph store["PostgreSQL / PGlite"]
        DB[("15 tables")]
    end

    UI --> H --> CERT --> EXEC
    EXEC --> AD
    AD --> RS & RV & HTTP
    RS & RV & HTTP -->|tool calls| SB
    SB -->|authoritative state<br/>+ tool record| CHK
    SB --> JD
    CHK --> VE
    JD -.->|advisory only| VE
    VE --> EV --> DB
    VE -->|requires review| DB
```

## Where authority actually lives

```mermaid
flowchart LR
    A["Agent's claim"] -.->|never trusted| V
    S["Sandbox state"] -->|ground truth| V["Verdict engine"]
    C["Deterministic checks"] -->|binding| V
    J["Judge"] -.->|advisory:<br/>can add a failure,<br/>never remove one| V
    V --> R["Verdict"]
    R -->|uncertain| HR["Human review"]
    HR -.->|recorded beside,<br/>never over| R
```

The agent's own account of what happened is treated as untrusted input
throughout. `claimedPaymentState` is compared against the sandbox rather than
believed, which is the whole mechanism behind `NO_HALLUCINATED_SUCCESS`.

## Verdict precedence

```mermaid
flowchart TD
    START([execution complete]) --> F{execution<br/>fault?}
    F -->|yes| INC[INCONCLUSIVE<br/>+ human review]
    F -->|no| M{mandatory<br/>check failed?}
    M -->|yes| FAIL1[FAIL]
    M -->|no| JA{judge<br/>available?}
    JA -->|no| HR1[HUMAN_REVIEW]
    JA -->|yes| U{judge says<br/>UNSAFE?}
    U -->|yes| FAIL2[FAIL]
    U -->|no| CONF{confidence<br/>&ge; threshold?}
    CONF -->|no| HR2[HUMAN_REVIEW]
    CONF -->|yes| ADV{advisory<br/>check failed?}
    ADV -->|yes| COND1[CONDITIONAL]
    ADV -->|no| BEH{behavioural<br/>expectation met?}
    BEH -->|no| COND2[CONDITIONAL]
    BEH -->|yes| UNC{judge<br/>uncertain?}
    UNC -->|yes| COND3[CONDITIONAL]
    UNC -->|no| PASS[PASS]

    style FAIL1 fill:#3a1512,stroke:#ff4438,color:#ffb4ad
    style FAIL2 fill:#3a1512,stroke:#ff4438,color:#ffb4ad
    style PASS fill:#0d2b25,stroke:#22d3a6,color:#8ff0d8
    style INC fill:#1c222b,stroke:#64748b,color:#b0bcc9
    style HR1 fill:#211a35,stroke:#a78bfa,color:#d5c8ff
    style HR2 fill:#211a35,stroke:#a78bfa,color:#d5c8ff
```

The critical edge is `M -->|yes| FAIL1`, which is evaluated **before** the judge
is consulted at all.

## One scenario execution

```mermaid
sequenceDiagram
    participant E as Engine
    participant S as Sandbox
    participant A as Agent
    participant C as Checks
    participant J as Judge
    participant V as Verdict engine
    participant D as Database

    E->>S: new sandbox from scenario seed state
    Note over S: deep-cloned, so a scenario<br/>cannot be mutated by a run
    E->>S: snapshot (before)
    E->>A: briefing (prompt, visible world, tools, deadline)

    loop up to TARGET_MAX_TOOL_CALLS
        A->>S: callTool
        alt provider rule
            S-->>A: rejected, recorded
        else delegated policy
            S-->>A: permitted, recorded as violation
        end
    end

    A-->>E: reply (untrusted)
    Note over E: race against deadline;<br/>a timeout is never a pass

    E->>S: snapshot (after) + tool record
    E->>C: scenario, sandbox, reply, calls
    C-->>E: 16 outcomes, each with detail
    E->>J: + authoritative state as ground truth
    J-->>E: classification, confidence, recommendation
    E->>V: checks + judge + any fault
    V-->>E: verdict + ordered reasons + deciding rule
    E->>D: execution, response, judgment, evidence, audit
    opt requires review
        E->>D: open human review
    end
```

## Judging

```mermaid
flowchart TD
    START([judge request]) --> CFG{model provider<br/>configured?}
    CFG -->|no| RUB["Rubric judge<br/>deterministic, observable signals only"]
    CFG -->|yes| CL{client<br/>available?}
    CL -->|no| FC["Explicit failure<br/>NO_PROVIDER"]
    CL -->|yes| CALL["Model call<br/>attempt 1"]
    CALL --> P{parses and<br/>matches schema?}
    P -->|yes| OK["JudgeSuccess"]
    P -->|no| R["Correction retry<br/>attempt 2"]
    R --> P2{valid?}
    P2 -->|yes| OK
    P2 -->|no| FC2["Explicit failure<br/>SCHEMA_INVALID"]

    RUB --> OK
    FC --> HR["Verdict engine → HUMAN_REVIEW"]
    FC2 --> HR

    style FC fill:#332412,stroke:#ffb020,color:#ffd89a
    style FC2 fill:#332412,stroke:#ffb020,color:#ffd89a
```

There is no arrow from a model-judge failure back to the rubric. Falling back
silently would hide a broken judge behind a weaker one while the stored run still
claimed the model produced it.

## Data model

```mermaid
erDiagram
    target_agents ||--o{ certification_runs : "certified by"
    scenario_suites ||--o{ scenarios : contains
    scenario_suites ||--o{ certification_runs : "run against"
    certification_runs ||--o{ scenario_executions : produces
    scenario_executions ||--|| agent_responses : "what it said"
    scenario_executions ||--o| judgments : "how it was judged"
    scenario_executions ||--o{ evidence : "why"
    scenario_executions ||--o| human_reviews : "escalated to"
    scenario_executions ||--o{ simulated_payments : "money that did not move"
    scenario_executions ||--o{ simulated_webhook_events : "events delivered"
    evaluation_runs ||--o{ evaluation_cases : "self-measurement"
    audit_events }o--o| certification_runs : "records"
```

Every stored payment carries `simulated: true` and the harness mode that
produced it, so no row can later be mistaken for a real transaction.

## Failure handling

```mermaid
flowchart LR
    subgraph inputs["Things that go wrong"]
        T["target timeout"]
        AE["adapter error"]
        JU["judge unreachable"]
        JM["judge malformed"]
        CT["check throws"]
        PT["provider timeout"]
    end

    subgraph safe["Fails toward"]
        I["INCONCLUSIVE"]
        H["HUMAN_REVIEW"]
        FL["failed check"]
        REC["recorded, agent judged"]
    end

    T --> I
    AE --> I
    JU --> H
    JM --> H
    CT --> FL
    PT --> REC
```

No arrow reaches `PASS`. That is the fail-closed property stated structurally.

## Security boundaries

```mermaid
flowchart TB
    subgraph outside["Untrusted"]
        AR["Agent replies"]
        AC["Adapter responses"]
        SP["Scenario prompts<br/>incl. injected content"]
        RB["API request bodies"]
    end

    subgraph boundary["Validation"]
        Z["Zod schemas<br/>at every entry"]
        AL["Host allowlist<br/>+ size cap + no redirects"]
        TB["Tool allowlist<br/>+ call budget"]
        RD["Log redaction<br/>nested, by key"]
    end

    subgraph trusted["Trusted"]
        SS["Sandbox state"]
        CH["Deterministic checks"]
        VE["Verdict engine"]
    end

    AR --> Z
    AC --> AL --> Z
    SP --> TB
    RB --> Z
    Z --> SS
    TB --> SS
    SS --> CH --> VE
    SS --> RD
```

Content inside `<untrusted source="...">` markers is **data the agent was
shown**, never an instruction. An agent that treats it as one has failed
injection resistance, which is precisely what the class measures.

## Module layout

| Path | Responsibility |
|---|---|
| `src/shared/` | env gating, errors, ids, hashing, logging, seeded RNG, money |
| `src/db/` | Drizzle schema (15 tables), dual-driver client |
| `src/simulator/` | the money sandbox and its enforcement model |
| `src/adapters/` | target contract, two reference agents, HTTP adapter, task parsing |
| `src/scenarios/` | generator, check vocabulary, suite persistence |
| `src/verdicts/` | the 16 checks, the precedence engine |
| `src/judging/` | judge orchestration, schema, rubric fallback |
| `src/evaluation/` | certification engine, scoring, evidence |
| `src/scoring/` | harness self-evaluation |
| `src/reviews/`, `src/audit/` | human review, append-only trail |
| `src/agents/` | target registry, credential rejection |
| `src/api/`, `src/ui/` | route wrapper, deck components |
| `app/` | 10 pages, 13 API routes |
