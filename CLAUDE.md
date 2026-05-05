# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

No build step required - this is a pure JavaScript/Node.js project.

```bash
npm run build  # No-op, included for compatibility
```

## Test

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:roadmap
npm run test:gpu
npm run test:platform
npm run test:ui
npm run test:runtime
npm run test:deterministic-pool
npm run test:policy
npm run test:policy-cli
npm run test:policy-engine
npm run test:policy-audit
npm run test:policy-e2e
npm run test:hardware-detector
```

Tests are Node.js scripts in `tests/` directory. No external test framework required.

## Development

```bash
# Run CLI directly
npm run dev
node bin/enhanced_cli.js hw-detect

# Run specific commands
node bin/enhanced_cli.js check
node bin/enhanced_cli.js recommend
node bin/enhanced_cli.js sync

# Sync and regenerate seed database
npm run sync:seed
```

## Architecture

LLM Checker is a deterministic model selection pipeline that analyzes hardware and recommends optimal LLM models. The architecture follows a clear separation of concerns:

### Core Pipeline Flow

1. **Hardware Detection** (`src/hardware/`) - Detects CPU/GPU/RAM and backend capabilities (CUDA, ROCm, Metal, CPU)
2. **Model Pool Assembly** (`src/data/`) - Merges SQLite catalog with local Ollama models
3. **Candidate Filtering** - Filters by use case and runtime constraints
4. **Fit Selection** - Chooses best quantization for available memory
5. **Deterministic Scoring** - Scores across Quality, Speed, Fit, Context dimensions
6. **Policy Evaluation** (`src/policy/`) - Optional governance layer for audit/enforce modes
7. **Ranking & Output** - Returns ranked recommendations with actionable commands

### Key Components

**Selection Engines** (`src/models/`):
- `deterministic-selector.js` - Primary selection algorithm with 4D scoring (Q/S/F/C)
- `scoring-engine.js` - Advanced scoring for smart-recommend and search commands
- `intelligent-selector.js` - Legacy intelligent selection (being phased out)
- `ai-check-selector.js` - LLM-based evaluation for ai-check command
- `scoring-config.js` - Centralized scoring weights for all three scoring systems

**Hardware Detection** (`src/hardware/`):
- `detector.js` - Platform-specific hardware detection
- `unified-detector.js` - Cross-platform detection abstraction
- `profiles.js` - Hardware tier profiles and capabilities
- `specs.js` - Hardware specifications and benchmarks
- `pc-optimizer.js` - PC optimization recommendations

**Data Layer** (`src/data/`):
- `model-database.js` - SQLite storage with packaged seed database
- `sync-manager.js` - Live sync from Ollama registry
- `seed/models.db` - Packaged Ollama catalog snapshot (229 models, 7176 variants)

**Policy & Governance** (`src/policy/`):
- `policy-engine.js` - Policy validation and enforcement logic
- `policy-manager.js` - Policy file management
- `audit-reporter.js` - Compliance report generation (JSON/CSV/SARIF)
- `cli-policy.js` - CLI policy integration

**Ollama Integration** (`src/ollama/`):
- `client.js` - Ollama API client with fallback mechanisms
- `manager.js` - Local model management
- `capacity-planner.js` - Ollama runtime capacity planning
- `enhanced-scraper.js` - Enhanced Ollama catalog scraping
- `native-scraper.js` - Native Ollama catalog scraping

**Calibration** (`src/calibration/`):
- Calibration artifacts generation for routing policies
- End-to-end calibration workflow support

**AI Features** (`src/ai/`):
- `multi-objective-selector.js` - Multi-objective optimization
- AI-powered model evaluation and selection

**Runtime Support** (`src/runtime/`):
- `runtime-support.js` - Runtime-specific optimizations

**CLI Layer** (`bin/`):
- `enhanced_cli.js` - Main CLI entry point with all commands
- `cli.js` - Simple CLI wrapper
- `mcp-server.mjs` - Model Context Protocol server for Claude Code integration

### Scoring Systems

Three distinct scoring systems exist for different purposes:

1. **Deterministic Weights** (`DETERMINISTIC_WEIGHTS`) - Used by `deterministic-selector.js` for primary recommendations. Per-category arrays [Q, S, F, C].

2. **Multi-Objective Weights** (`MULTI_OBJECTIVE_WEIGHTS`) - Used by `multi-objective-selector.js` for hardware-aware selection. 5 factors: quality, speed, ttfb, context, hardwareMatch.

3. **Scoring Engine Weights** (`SCORING_ENGINE_WEIGHTS`) - Used by `scoring-engine.js` for smart-recommend and search. {Q, S, F, C} objects with specialized presets.

All weights are centralized in `src/models/scoring-config.js`.

### Memory Estimation

Memory requirements use calibrated bytes-per-parameter values:
- Q8_0: 1.05 bytes/param
- Q4_K_M: 0.58 bytes/param
- Q3_K: 0.48 bytes/param

MoE models support sparse parameter estimation with explicit metadata fields (`total_params_b`, `active_params_b`, `expert_count`, `experts_active_per_token`).

### Model Catalog

The project ships with a pre-synced SQLite snapshot of the Ollama catalog:
- 229 Ollama models
- 7176 variants
- Pull counts, tag counts, last-updated metadata
- Variant params, quantization, size, context, and input type fields

Refresh with `llm-checker sync`. For release maintainers, regenerate seed with `npm run sync:seed`.

### MCP Integration

The built-in MCP server (`bin/mcp-server.mjs`) exposes LLM Checker tools to Claude Code:
- Hardware detection and analysis
- Model recommendations and search
- Ollama management (list, pull, run, remove)
- Advanced features (benchmark, compare, cleanup, project analysis)

Setup: `claude mcp add llm-checker -- npx llm-checker-mcp`

## Important Patterns

### Deterministic Behavior

The selection pipeline is deterministic - same inputs produce same ranked output. This is critical for:
- Policy enforcement and compliance reporting
- Reproducible recommendations across runs
- Reliable governance workflows

### Fallback Chain

Model catalog follows this priority:
1. Synced SQLite catalog (`~/.llm-checker/models.db`)
2. Scraped cache data
3. Curated fallback catalog (`src/models/catalog.json`)

### Cross-Platform Detection

Hardware detection abstracts platform differences:
- Apple Silicon: Metal backend detection
- NVIDIA: CUDA detection with Jetson support
- AMD: ROCm detection with VRAM parsing
- Intel: Arc and integrated GPU detection
- CPU: AVX-512, AVX2, ARM NEON support

### Policy Integration

Policy evaluation is optional but integrated throughout:
- `--policy <file>` flag for check/recommend commands
- Audit mode (reports violations, exits 0)
- Enforce mode (blocking violations return non-zero)
- Export formats: JSON, CSV, SARIF

### Calibration Routing

Calibration policies generated by `calibrate --policy-out` can be used in:
- `recommend --calibrated [file]`
- `ai-run --calibrated [file]`

Resolution precedence: `--policy` > `--calibrated` > deterministic fallback.

## Testing Approach

Tests are Node.js scripts that exercise specific components:
- Hardware detection regression tests
- Policy engine validation
- End-to-end integration tests
- Platform-specific tests (AMD GPU, CUDA Jetson, Termux)
- Calibration workflow tests

No external test framework - tests use direct Node.js execution and assertion patterns.

## Dependencies

**Core Dependencies:**
- `@modelcontextprotocol/sdk` - MCP server implementation
- `chalk` - Terminal colors
- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `node-fetch` - HTTP requests
- `ora` - Loading spinners
- `systeminformation` - System information
- `table` - Table formatting
- `yaml` - YAML parsing
- `zod` - Schema validation

**Optional Dependencies:**
- `sql.js` - SQLite database (required for database commands)

## Common Development Tasks

### Adding a New Model Category

1. Update scoring weights in `src/models/scoring-config.js`
2. Add category handling in `src/models/deterministic-selector.js`
3. Update CLI help text in `bin/enhanced_cli.js`

### Modifying Hardware Detection

1. Update platform-specific logic in `src/hardware/detector.js`
2. Add regression tests in `tests/hardware-detector-regression.js`
3. Update tier profiles in `src/hardware/profiles.js`

### Adding Policy Rules

1. Update schema in `src/policy/policy-engine.js`
2. Add validation logic in `src/policy/policy-manager.js`
3. Add tests in `tests/policy-*.test.js`

### Updating Model Catalog

1. Run `llm-checker sync` to refresh from Ollama
2. Run `npm run sync:seed` to regenerate packaged seed
3. Test with `node bin/enhanced_cli.js list-models`

## Project Structure Notes

- `bin/` - CLI entry points and MCP server
- `src/` - All source code organized by domain
- `tests/` - Test files organized by component
- `docs/` - Documentation and fixtures
- `analyzer/` - Analysis tools
- `ml-model/` - ML model training and benchmarking
- `assets/` - Static assets (logos, images)

## License

This project is licensed under NPDL-1.0 (No Paid Distribution License). Free use, modification, and redistribution are allowed, but selling the software or offering it as a paid hosted/API service requires a separate commercial license.
