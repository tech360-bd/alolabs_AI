# Memory guide

The repository already contains short-term, long-term, agent, department and company memory models. The AgentOS run pipeline makes best-effort episodic memory write-back after completion or failure. `/api/v1/memory` supports agent-level reads/writes after checking company agent access. Private entries are filtered by user and company on the v1 route; direct legacy memory APIs need a full tenant security audit.

**Known limits:** cross-step context is truncated to recent completed outputs; no verified project-memory retrieval, retention policy enforcement, deletion audit or RAG source verification has been demonstrated in the new command path. A memory record should be treated as untrusted context, not instructions. External text must never override system policy. A failed write-back does not retroactively mark an otherwise completed run failed, but it is not proof of durable memory.
