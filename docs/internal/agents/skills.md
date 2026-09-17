# docs/internal/agents/skills.md

**Last reviewed:** 2026-09-02
**Scope:** Modern AI/LLM capabilities, frameworks, infrastructure, and engineering practices relevant to production software.

Model catalogs change quickly. This inventory is capability-first. Before selecting a specific model identifier, verify it on the linked vendor catalog and run the workload's own evaluation set.

## 1. Frontier reasoning and general-purpose models

### OpenAI model platform

Current OpenAI model families cover frontier reasoning, fast general-purpose inference, coding, real-time audio, vision, image generation, transcription, embeddings, and moderation.

Use them for:

- Multi-step reasoning with tool access.
- Structured extraction and transformation.
- Coding agents and repository work.
- Low-latency voice interfaces.
- Multimodal understanding.
- Server-side image generation or editing when deterministic UI is not required.

Primary interfaces:

- **Responses API** for tool-using, multimodal model calls and stateful response workflows.
- **Structured Outputs** when the application requires schema-valid JSON.
- **Realtime API** for low-latency audio conversations and live tool calls.
- **Agents SDK** for handoffs, tools, guardrails, sessions, tracing, and agent composition.
- **Evals** for regression testing model behavior.

Official references:

- [OpenAI model catalog](https://platform.openai.com/docs/models)
- [Responses API](https://platform.openai.com/docs/api-reference/responses)
- [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Realtime API](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Agents SDK for JavaScript](https://openai.github.io/openai-agents-js/)
- [Evaluation guide](https://platform.openai.com/docs/guides/evals)

### Anthropic Claude platform

Claude model families emphasize strong language reasoning, long-context work, code generation, vision, tool use, prompt caching, and computer-use workflows.

Use them for:

- Long-document analysis.
- Complex coding and review tasks.
- Agentic tool use with explicit schemas.
- Cached, repeated system or document prefixes.
- Computer-use experiments inside isolated environments.

Official references:

- [Claude model overview](https://docs.anthropic.com/en/docs/about-claude/models/overview)
- [Tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Computer use](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use)

### Google Gemini platform

Gemini model families support multimodal input, long context, function calling, live audio/video interaction, grounding, context caching, and embeddings.

Use them for:

- Native multimodal understanding.
- Long-context synthesis.
- Live camera or audio experiences.
- Function-calling applications.
- Search-grounded responses where supported.

Official references:

- [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models)
- [Live API](https://ai.google.dev/gemini-api/docs/live)
- [Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Context caching](https://ai.google.dev/gemini-api/docs/caching)
- [Grounding](https://ai.google.dev/gemini-api/docs/grounding)

### Open-weight model families

Open-weight models are appropriate when data locality, custom deployment, predictable unit economics, or model customization matters more than using the strongest hosted frontier model.

Common current ecosystems include Meta Llama, Mistral, Qwen, Gemma, and DeepSeek model families. Licenses, supported context lengths, quantization quality, safety characteristics, and serving requirements differ. Verify each model card before deployment.

Official references:

- [Meta Llama](https://www.llama.com/)
- [Mistral model documentation](https://docs.mistral.ai/getting-started/models/models_overview/)
- [Qwen repository and model cards](https://github.com/QwenLM/Qwen)
- [Google Gemma](https://ai.google.dev/gemma)
- [Hugging Face model hub](https://huggingface.co/models)

## 2. Code generation and software agents

Modern coding systems can inspect repositories, edit multiple files, run commands, execute tests, review diffs, use browsers, and open pull requests. The reliable unit is not “generate code”; it is an agent loop constrained by repository state, tools, tests, and review gates.

Core capabilities:

- Repository search and dependency tracing.
- Multi-file implementation.
- Compiler, lint, test, and browser feedback loops.
- Patch review and change summarization.
- Issue-to-pull-request workflows.
- Migration assistance and mechanical refactors.
- Security and correctness review.

Best practices:

1. Give the agent a narrow mandate and explicit non-goals.
2. Require it to inspect existing conventions before editing.
3. Keep repository instructions in `agents.md`.
4. Expose deterministic tools rather than asking the model to simulate them.
5. Run the smallest relevant test first, then the full gate.
6. Review diffs; never equate passing tests with correct product behavior.
7. Keep credentials, production writes, and destructive operations behind explicit approval.
8. Record model, prompt, tool calls, commit, and test results for reproducibility.

## 3. Multimodal systems

Multimodal models can combine text with images, documents, audio, video frames, and live camera input. They are useful for semantic understanding, but they should not be confused with deterministic geometry or measurement systems.

Strong use cases:

- Document and screenshot understanding.
- Visual question answering.
- Object and scene description.
- Audio transcription and classification.
- Voice interfaces.
- Video summarization and event extraction.
- Accessibility descriptions.

Reliability boundaries:

- Use dedicated OCR for exact text only when the model's extraction quality is measured.
- Use conventional computer vision or calibrated sensors for precise geometry and safety-critical measurements.
- Preserve source media references so outputs can be audited.
- Treat frame sampling as a product decision; missed frames can hide important events.
- Do not generate interactive UI as pixels when the user must select, edit, test, or undo individual elements.

## 4. Real-time voice and conversational interfaces

A modern voice stack has separate layers:

```text
Audio capture
  → voice activity detection
  → transcription or speech-to-speech model
  → intent/tool routing
  → deterministic application action
  → optional synthesized speech
```

Capabilities:

- Streaming transcription.
- Barge-in and interruption.
- Turn detection.
- Low-latency speech-to-speech responses.
- Tool calls during a live session.
- Voice activity and prosody-aware experiences.

Production guidance:

- Make every important action available through touch or keyboard.
- Show a live transcript for trust and correction.
- Execute local commands such as pause, undo, and selection without a model call.
- Distinguish interim transcripts from confirmed commands.
- Do not request microphone permission before user intent.
- Keep cancellation faster than generation.
- Treat background noise, accents, code-switching, and partial speech as first-class evaluation cases.

Browser primitives:

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Transformers.js](https://huggingface.co/docs/transformers.js/) for supported on-device tasks

## 5. Tool use and structured execution

Tool use lets a model request actions through typed application functions. The application remains responsible for validation, authorization, execution, and result handling.

Use structured outputs for:

- Command routing.
- Entity extraction.
- Workflow plans.
- UI-independent view models.
- Data transformations.
- Agent handoffs.

Do not let a model directly emit:

- SQL executed without validation.
- Shell commands with unrestricted authority.
- Production writes without a confirmation boundary.
- UI markup used as the application architecture.
- Authorization decisions.
- Financial, medical, or legal actions without domain controls.

A robust tool boundary includes:

1. Narrow name and description.
2. Strict input schema.
3. Runtime validation.
4. Authentication and authorization outside the model.
5. Idempotency for writes.
6. Timeouts and bounded retries.
7. Sanitized output returned to the model.
8. Audit logs with sensitive-field redaction.

## 6. Agent frameworks and protocols

### OpenAI Agents SDK

Useful for agents, tools, handoffs, guardrails, sessions, streaming, and traces when building on OpenAI's platform.

### LangGraph

A graph/state-machine runtime for long-running, interruptible agent workflows. Use it when explicit state, branching, checkpoints, and human approval are central.

- [LangGraph documentation](https://langchain-ai.github.io/langgraph/)

### LlamaIndex

A data and agent framework oriented around connectors, indexing, retrieval, workflows, and document-heavy applications.

- [LlamaIndex documentation](https://docs.llamaindex.ai/)

### Vercel AI SDK

A TypeScript toolkit for streaming model output, tool calls, structured data, and provider abstraction in web applications.

- [Vercel AI SDK](https://ai-sdk.dev/docs)

### Model Context Protocol (MCP)

MCP standardizes how hosts expose resources, prompts, and tools to models. It is useful for interoperable connectors, but it is not an authorization system by itself.

- [Latest MCP specification](https://modelcontextprotocol.io/specification/latest)

Framework selection rule: use the smallest runtime that expresses the workflow. A direct model call plus three typed tools is often better than adopting a multi-agent framework.

## 7. Retrieval and knowledge systems

Retrieval-augmented generation combines a model with external evidence. High-quality retrieval is an information-system problem, not merely an embedding call.

Pipeline:

```text
Ingest → normalize → chunk → index → retrieve → rerank → assemble context → answer → cite → evaluate
```

Core tools:

- Embedding models for semantic retrieval.
- Lexical search such as BM25 for exact terms.
- Hybrid retrieval for broad coverage.
- Rerankers for better top-k ordering.
- Metadata filters for tenant, time, permission, and document type.
- Query rewriting and decomposition for difficult questions.
- Citation mapping back to immutable source spans.

Best practices:

- Evaluate retrieval separately from answer generation.
- Include stale, duplicate, missing, malformed, and access-restricted documents in tests.
- Enforce permissions before retrieval, not after generation.
- Preserve document version and timestamp.
- Prefer smaller, high-signal context over dumping entire corpora.
- Measure answerability and allow “not enough evidence.”

Common infrastructure:

- PostgreSQL with pgvector for moderate-scale integrated systems.
- Dedicated vector databases when operational requirements justify them.
- Elasticsearch/OpenSearch for strong lexical and hybrid search.
- Object storage for source documents and immutable artifacts.

## 8. Evaluation

A production AI feature needs an executable definition of quality.

Evaluation layers:

- **Task success:** Did the user achieve the intended outcome?
- **Deterministic checks:** Schema validity, exact fields, tool arguments, policy rules.
- **Retrieval checks:** Recall, precision, ranking, citation correctness.
- **Model-graded checks:** Style, completeness, groundedness; calibrated against humans.
- **Human review:** High-risk, ambiguous, or high-value samples.
- **Online signals:** Completion, corrections, abandonment, latency, cost, complaint rate.

Build an evaluation set from real failures, not only ideal examples. Pin datasets and prompts. Track model and tool versions. Run regressions before changing models, prompts, retrieval, or tool descriptions.

Avoid one aggregate score. A system can improve average quality while creating a severe regression for one language, input type, customer segment, or safety boundary.

## 9. Observability

Trace the complete request:

```text
user input
→ model request
→ model response
→ tool decision
→ tool input
→ tool result
→ final output
→ user correction
```

Record:

- Model and version.
- Prompt/template version.
- Token and audio usage.
- Time to first token or first audio.
- Total latency.
- Tool latency and failures.
- Retry count.
- Cache hits.
- Safety decisions.
- User feedback and corrections.

Redact secrets, personal data, private documents, and authentication material before traces leave the trust boundary.

Useful ecosystems include OpenTelemetry, vendor tracing, and specialist LLM observability platforms. Prefer open trace formats where possible.

## 10. Security boundaries

Prompt injection is untrusted input attempting to change model behavior. It cannot be solved by one stronger system prompt.

Required controls:

- Treat model output as untrusted.
- Separate data from instructions where possible.
- Allowlist tools per workflow.
- Apply least privilege to every tool credential.
- Require explicit approval for consequential writes.
- Validate and normalize URLs and file paths.
- Block server-side request forgery paths.
- Scan retrieved or uploaded content according to risk.
- Isolate browser/computer-use agents.
- Limit execution time, network access, filesystem access, and spend.
- Use idempotency keys for repeated writes.
- Preserve an audit trail independent of model memory.

MCP, agent frameworks, and model tool-calling features do not replace application authorization.

## 11. Deployment and inference

### Hosted APIs

Best when:

- Frontier quality matters.
- Traffic is variable.
- The team wants minimal inference operations.
- Rapid model upgrades are valuable.

Control cost with model routing, short contexts, caching, concise structured outputs, streaming, and hard usage limits.

### vLLM

A high-throughput open-source inference server for supported transformer models, with OpenAI-compatible APIs and serving optimizations.

- [vLLM documentation](https://docs.vllm.ai/)

### SGLang

An open-source serving and programming stack focused on efficient structured and agentic generation workloads.

- [SGLang documentation](https://docs.sglang.ai/)

### llama.cpp

A lightweight C/C++ inference ecosystem for quantized local models across CPUs and GPUs.

- [llama.cpp repository](https://github.com/ggml-org/llama.cpp)

### Ollama

A developer-friendly local model runner. Useful for prototypes and local workflows; production governance and scaling remain the application's responsibility.

- [Ollama documentation](https://docs.ollama.com/)

### Browser and edge inference

Use when privacy, offline behavior, or zero marginal inference cost outweighs initial download size and device variability.

Relevant technologies:

- Transformers.js.
- ONNX Runtime Web.
- WebGPU.
- MediaPipe Tasks.

Always feature-detect, provide a fallback, and test low-memory and thermally constrained devices.

## 12. Latency and cost engineering

Users experience an AI product as a latency pipeline. Measure each stage rather than only total response time.

Techniques:

- Stream partial output.
- Begin deterministic UI work before model completion.
- Route simple tasks to smaller models.
- Cache stable prefixes and repeated results.
- Keep tool schemas concise.
- Parallelize independent retrieval or tools.
- Avoid repeated serialization of large context.
- Summarize or retrieve history instead of replaying it indefinitely.
- Cancel work immediately when the user interrupts.
- Set per-request and per-user spend limits.

Do not use an LLM for deterministic operations such as sorting, arithmetic, date calculation, access control, undo, or known commands.

## 13. Data and privacy

Before sending data to a model provider, define:

- What data is collected.
- Why it is needed.
- Where it is processed.
- How long it is retained.
- Whether it may be used for provider training.
- Who can access traces and prompts.
- How deletion and export work.

Prefer local processing for raw audio, camera frames, personal calendars, and private documents when product quality allows it. Minimize before transmission and send only the context required for the current task.

## 14. Recommended decision process

1. Write the user task and unacceptable failures.
2. Build the deterministic parts first.
3. Create an evaluation set before provider selection.
4. Compare at least one frontier model and one cheaper model.
5. Measure quality, p50/p95 latency, and cost per completed task.
6. Add retrieval only when external evidence is needed.
7. Add an agent framework only when workflow state requires it.
8. Add self-hosting only when privacy, control, or economics justify operations.
9. Ship with fallback behavior, budgets, and observability.
10. Re-run evaluations whenever a model, prompt, tool, or retrieval layer changes.

## 15. How AI fits Flow

Flow's current release intentionally requires no LLM. Its highest-value commands are deterministic and local.

A future model integration should be limited to this boundary:

```text
unrecognized user phrase
  → structured PlanCommand
  → runtime validation
  → existing deterministic scheduler
```

The model must not:

- Decide calendar authorization.
- Move fixed events silently.
- Write directly to external calendars.
- Generate UI or animation code.
- Replace undo history.

This architecture keeps the product immediate, free to demonstrate, testable, and resilient while leaving a clean path to broader natural-language understanding.
