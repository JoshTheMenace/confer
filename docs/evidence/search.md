# Search evidence: what each layer adds

Run on 2026-11-09 against the live Elasticsearch Serverless project (30 seeded talks in `confer_talks`), with the same query sent four ways. The app's Discover screen uses the last row for typed questions and the hybrid row when it searches from your profile.

Think of two librarians. One matches your exact words (keyword, BM25). The other understands what you mean (semantic, ELSER on a `semantic_text` field). Reciprocal rank fusion merges their two lists, and for a typed question a third reader (a reranker) re-reads the shortlist against the question.

### "tracing across 200 services" (the words are in the talk)

| Method | Top 3 talks |
|---|---|
| Keyword only (BM25) | 1. One Trace, 200 Services: Finding the Slow Hop<br>2. Tracing AI Agents: What Did the LLM Actually Do?<br>3. Zero Trust Between Services, One Identity at a Time |
| Semantic only (ELSER) | 1. One Trace, 200 Services: Finding the Slow Hop<br>2. OpenTelemetry Collector Pipelines That Survive Production<br>3. Continuous Profiling: Find the Line Burning Your Money |
| Hybrid (RRF of both) | 1. One Trace, 200 Services: Finding the Slow Hop<br>2. OpenTelemetry Collector Pipelines That Survive Production<br>3. Zero Trust Between Services, One Identity at a Time |
| Hybrid + reranker | 1. One Trace, 200 Services: Finding the Slow Hop<br>2. OpenTelemetry Collector Pipelines That Survive Production<br>3. Kubernetes Networking, Explained with Packets |

Everyone finds the first talk. Keyword's third result matched the word "services" in a security talk; semantic's second result is the OpenTelemetry talk, which never says "200 services" but is what the person needs next.

### "my pager keeps waking me up at night" (none of the words are in any talk)

| Method | Top 3 talks |
|---|---|
| Keyword only (BM25) | 1. Catching Container Escapes at Runtime<br>2. One Trace, 200 Services: Finding the Slow Hop<br>3. GitOps at 60 Clusters: What Broke and What Held |
| Semantic only (ELSER) | 1. Designing Developer Tools for Tired Humans<br>2. LLM Assistants for On-Call: Helpful or Hazard?<br>3. SLOs That Match What Users Feel |
| Hybrid (RRF of both) | 1. Designing Developer Tools for Tired Humans<br>2. One Trace, 200 Services: Finding the Slow Hop<br>3. Catching Container Escapes at Runtime |
| Hybrid + reranker | 1. Designing Developer Tools for Tired Humans<br>2. SLOs That Match What Users Feel<br>3. Catching Container Escapes at Runtime |

This is the case for semantic search: keyword returns noise, because the person described a feeling and not a topic. Semantic finds the on-call and SLO talks.

### "how do I get more people from different backgrounds to speak"

| Method | Top 3 talks |
|---|---|
| Keyword only (BM25) | 1. From Attendee to Speaker: Your First Talk Proposal<br>2. Tracing AI Agents: What Did the LLM Actually Do?<br>3. eBPF for the Rest of Us: Zero-Code Telemetry |
| Semantic only (ELSER) | 1. Talks Everyone Can Follow: Accessible Slides, Captions and Demos<br>2. From Attendee to Speaker: Your First Talk Proposal<br>3. Designing Developer Tools for Tired Humans |
| Hybrid (RRF of both) | 1. From Attendee to Speaker: Your First Talk Proposal<br>2. Your First Pull Request to a Cloud Native Project<br>3. The Postmortem Nobody Dreads |
| Hybrid + reranker | 1. Talks Everyone Can Follow: Accessible Slides, Captions and Demos<br>2. Docs Are a Product: Writing for the Newcomer<br>3. From Attendee to Speaker: Your First Talk Proposal |

Each query took 0.5 to 2.1 seconds from a laptop on conference Wi-Fi, including inference. In the app, talks, booths and people are searched in one round trip (`msearch`), and `GET /api/discover` answered the first query in 0.38s.

## Where else search does the work

- **Things in common.** Same tags match exactly. Whether two different tags are "related" is judged by a reranker (`.jina-reranker-v3`) that reads the pair together: OpenTelemetry and Distributed tracing relate, React and Rust do not. We first tried embedding cosine and measured that it could not tell those apart (see [PR #17](https://github.com/JoshTheMenace/confer/pull/17)).
- **Search respects consent.** A search for people only reads topic fields (the tags someone picked and what they said they are looking for, by keyword, and `peer_semantic`, which holds the tags only, by meaning). It never reads what a person wrote about themselves or what they are stuck on, and it only covers attendees who turned on "discoverable". The filter sits inside both the keyword and the semantic retriever, so nobody out of scope can be pulled in by either.
- **Booth prospects** are a hybrid search of the booth's topics against attendees who opted in to be found by matching booths, including their "what I'm stuck on" line. Booths get topics and fit, and no name unless the attendee turned on "booths may see my name" or shared their card.
- **What is reranked.** All three lists (talks, booths, people) use hybrid retrieval. Only talks are reranked, and only for a typed question. The tables above are observations from the seeded data, not a labelled relevance evaluation, and fit scores are ranking hints, not probabilities.
- **Booth and organizer numbers** are Elasticsearch aggregations (date histogram for the event pulse, terms for top interests).
- **Elasticsearch is the only database**: profiles, the sealed vault, meetings, shares, conversations, receipts and talks.
