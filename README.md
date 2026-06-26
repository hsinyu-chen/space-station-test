# SpaceStationTest

A space-station-themed **Needle-In-A-Haystack (NIAH)** evaluation tool for benchmarking LLM long-context retrieval accuracy across varying context depths and window sizes.

🔗 **Live Demo**: [https://hsinyu-chen.github.io/space-station-test/](https://hsinyu-chen.github.io/space-station-test/)

## What It Does

SpaceStationTest embeds critical data points ("needles") into large volumes of simulated space station system logs ("haystack"), then asks an LLM to retrieve them, reason about them, and scan bounded log ranges for leaked confidential values. This measures how well a model handles information retrieval at different context depths (e.g., 10%, 50%, 90%) and window sizes (32k–128k+ tokens).

A core design goal is **maximizing KV cache reuse**: all test scenarios share the same haystack document, so the prompt prefix is cached once and reused across every evaluation round. This dramatically reduces redundant computation on providers that support prompt caching (e.g., llama.cpp KV cache, Gemini context caching).

## Key Features

- **Three-Phase Evaluation**
  - **Phase 1 — Exact Retrieval** *(Direct Recall)*: Verifies whether the model can extract precise values (checksums, sensor readings) at a directly specified timestamp.
  - **Phase 2 — Confidential Leak Scan** *(Indirect Recall)*: Plaintext secret codes are injected into the comms chatter a few lines before each heartbeat. The model is asked whether any secret leaked *between two heartbeat timestamps* and must reply with the exact value verbatim, or `NONE`. This probes range-scoped retrieval **and precision**: decoy lines (which mention a code but disclose no value) and clean ranges (no secret at all) must return `NONE`, and surfacing a code from outside the queried range is penalized. Scored deterministically by string match — no judge.
  - **Phase 3 — Logical Reasoning** *(Reasoning)*: Tests if the model can identify embedded state changes and draw correct conclusions.
- **LLM-as-Judge Scoring**: A separate Judge model rates the reasoning-phase responses on a 1–10 scale with qualitative feedback, reducing human evaluation effort. (Retrieval and leak-scan phases are scored deterministically by string match.)
- **Realistic Haystack Generation**: Chronologically consistent, value-bounded space station logs — no random garbage data.
- **Multilingual Support**: Test prompts and assessment criteria available in English and Traditional Chinese.
- **Token Usage Tracking**: Monitors Input, Cached (KV Cache), and Output tokens with per-phase breakdowns for both Target and Judge models.
- **Performance Metrics** *(llama.cpp only)*: Reports Prompt Processing (PP) and Token Generation (TG) speeds.
- **Markdown Report Export**: One-click export of standardized test reports for documentation and comparison.

## Getting Started

### Prerequisites

- Node.js 18+
- Access to an LLM provider: llama.cpp (OpenAI-compatible API), OpenAI, or Gemini

### Installation

```bash
git clone https://github.com/hsinyu-chen/space-station-test.git
cd space-station-test
git submodule update --init --recursive
npm install
```

### Usage

```bash
npm start
```

1. Open `http://localhost:4200`
2. Select a **Target Model** (the model under test) and a **Judge Model** (the evaluator)
3. Set the desired **Context Size** (32k / 64k / 128k)
4. Click **Start NIAH Test** and monitor real-time progress
5. Export results via **Copy Markdown Report**

## Tech Stack

- Angular 18+ (Standalone Components, Signals, Zoneless)
