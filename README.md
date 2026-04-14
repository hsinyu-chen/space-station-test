# SpaceStationTest: LLM Retrieval Evaluation Tool

SpaceStationTest is a benchmark utility designed to evaluate the retrieval and reasoning capabilities of Large Language Models (LLMs) within long-context window environments. It utilizes the "Needle In A Haystack" (NIAH) methodology by embedding specific data points into large volumes of simulated space station logs.

## Overview

The primary objective of this tool is to measure accuracy and efficiency across various context depths. It simulates a realistic system environment through chronologically consistent log generation, allowing for objective assessment of model performance in high-density data retrieval tasks.

## Key Features

- **Dynamic Haystack Generation**: Generates temporally consistent system logs with configurable context lengths.
- **Two-Phase Evaluation**:
  - Phase 1: Checksum verification for precise data extraction.
  - Phase 2: Logical reasoning based on embedded "needles" (state changes).
- **Scoring System**: Implements a 1-10 scoring model with qualitative feedback from a designated Judge LLM.
- **Resource Monitoring**: Tracks cumulative token usage, identifying Input, Cached (KV Cache), and Output tokens.
- **Performance Metrics**: Reports Prompt Processing (PP) and Token Generation (TG) speeds separately for the Target and Judge models.
- **High-Performance Log Inspection**: Includes a virtual-scroll viewer capable of handling context windows exceeding 100,000 lines.
- **Report Export**: Generates standardized Markdown reports for documentation and analysis.

## Prerequisites

- Node.js (version 18 or higher)
- npm or yarn
- Access to an LLM provider supported by the `@hcs/llm-core` package.

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd SpaceStationTest
npm install
```

## Configuration

The application expects LLM providers to be configured within the environment. Ensure that the necessary API keys and provider endpoints are accessible via the configuration layer.

## Usage

1. Start the development server:
   ```bash
   npm run start
   ```
2. Open the application in a browser (typically at `http://localhost:4200`).
3. Select the **Target Model** (the model being evaluated) and the **Judge Model** (the model performing the evaluation).
4. Set the desired **Context Size** (e.g., 32k, 64k, 128k).
5. Click **Start NIAH Test** to begin the automated evaluation.
6. Monitor real-time progress in the results table.
7. Upon completion, use **Copy Markdown Report** to export the findings.

## Technical Architecture

This project is built using Angular (v18+) and follows the HCS monorepo standards:
- **Service Layer**: Handles haystack generation, needle insertion, and LLM communication state.
- **UI Layer**: Utilizes Angular Signals for zoneless change detection and high-performance state management.
- **Virtualization**: Employs `@angular/cdk/scrolling` for efficient rendering of large text blocks.
- **Decoupling**: Business logic resides in pure TypeScript providers or services, maintaining independence from UI components where possible.
