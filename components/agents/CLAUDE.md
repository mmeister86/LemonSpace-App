# components/agents/ - Agent Specs (Markdown)

Dieser Ordner enthaelt die menschenlesbaren Agent-Spezifikationen.
Jede Datei ist gleichzeitig Produktdoku und kuratierte Prompt-Quelle.

---

## Dual Model (verbindlich)

Die Agent-Runtime basiert auf zwei Quellen:

1. **Struktur in TypeScript**
   - `lib/agent-definitions.ts`
   - `lib/agent-run-contract.ts`
2. **Kuratierte Prompt-Segmente in Markdown**
   - `components/agents/*.md`
   - kompiliert via `scripts/compile-agent-docs.ts`
   - konsumiert aus `lib/generated/agent-doc-segments.ts`

Wichtig:
- `convex/agents.ts` liest **kein** Raw-Markdown zur Laufzeit.
- Nur markierte `AGENT_PROMPT_SEGMENT`-Bloecke wirken prompt-relevant.
- Unmarkierter Text ist Doku fuer Menschen.

---

## Dateikonvention pro Agent

Dateiname muss dem Agent-Id-Muster folgen, z. B.:
- `campaign-distributor.md` fur `campaign-distributor`

Die Zuordnung passiert ueber `docs.markdownPath` in `lib/agent-definitions.ts`.

---

## Frontmatter (Pflicht)

Jede Agent-Datei startet mit Frontmatter:

```md
---
name: Campaign Distributor
description: ...
tools: WebFetch, WebSearch, Read, Write, Edit
color: yellow
emoji: lemon
vibe: ...
---
```

Hinweise:
- `emoji` soll als ASCII-Token gepflegt werden (z. B. `lemon`), nicht als Unicode-Zeichen.
- Frontmatter ist Referenz fuer Doku und muss mit der TS-Definition konsistent bleiben.

---

## Prompt Segment Marker (Pflicht)

Aktuell required keys:
- `role`
- `style-rules`
- `decision-framework`
- `channel-notes`

Marker-Format:

```md
<!-- AGENT_PROMPT_SEGMENT:role:start -->
Segment text
<!-- AGENT_PROMPT_SEGMENT:role:end -->
```

Regeln:
- Pro required key genau **ein** start- und **ein** end-marker.
- Kein leerer Segment-Inhalt.
- Marker-Namen muessen exakt passen.
- Segment-Reihenfolge in der Generierung folgt `AGENT_PROMPT_SEGMENT_KEYS`.

Optional zusaetzliche Segmenttypen sind erlaubt, muessen aber erst im Compiler/
Runtime-Prompting verankert werden, bevor sie Wirkung haben.

---

## Schreibregeln fuer Segmente

- Schreibe handlungsorientiert und spezifisch.
- Keine versteckte Denkspur (kein chain-of-thought).
- Keine erfundenen Produktfakten, Statistiken oder Deadlines.
- Kanalregeln konkret, aber nicht auf fragile Einzelformate ueber-engineeren.
- Immer auf strukturierten Runtime-Output ausrichten (`artifactType`, `sections`, `metadata`, `qualityChecks`, `previewText`, `body`).

---

## Nach jeder Aenderung

1. Prompt-Segmente kompilieren:

```bash
npx tsx scripts/compile-agent-docs.ts
```

2. Relevante Tests laufen lassen:

```bash
npm run test -- tests/lib/agent-doc-segments.test.ts tests/lib/agent-prompting.test.ts
```

3. Bei Struktur-Aenderungen zusaetzlich:

```bash
npm run test -- tests/lib/agent-definitions.test.ts tests/lib/agent-run-contract.test.ts
```

---

## Wann andere Dateien mitziehen

- `lib/agent-definitions.ts` anpassen, wenn sich Inputs, Kanaele, Regeln, Blueprints oder Parameter aendern.
- `lib/agent-prompting.ts` anpassen, wenn neue Segmenttypen wirklich in Prompts einfliessen sollen.
- `scripts/compile-agent-docs.ts` anpassen, wenn required segment keys geaendert werden.
- `messages/de.json` / `messages/en.json` anpassen, wenn neue UI-Labels sichtbar werden.

---

## Anti-Patterns

- Komplettes monolithisches Prompt-Dokument ohne Marker-Struktur.
- Raw-Markdown als Runtime-Input ohne Compile-Step.
- Agent-Output nur als Freitext ohne strukturierte Deliverables.
- Segment-Inhalte, die den TS-Contracts widersprechen.
