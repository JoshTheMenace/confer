# Gitar: a CI failure diagnosed and fixed on the pull request

[PR #13](https://github.com/JoshTheMenace/confer/pull/13) added an accessibility gate to CI (`pnpm lint`, Biome's accessibility rules over the web app). The gate failed on a real, existing issue. This is what happened next, with Gitar's auto-apply turned on.

| Step | What happened | Link |
|---|---|---|
| 1 | CI `check` fails on the new gate | [run 42698739197](https://github.com/JoshTheMenace/confer/actions/runs/42698739197) |
| 2 | Gitar posts a CI failure analysis: caused by this PR (not flaky, not infrastructure), root cause is one accessibility lint error. It also says the log excerpt did not show which file. | Gitar keeps one review comment per PR and rewrote it later, so the first analysis is no longer on the page. [Our reply quoting it](https://github.com/JoshTheMenace/confer/pull/13#issuecomment-6751446829) and [Gitar's answer](https://github.com/JoshTheMenace/confer/pull/13#issuecomment-6751505211) are. |
| 3 | We make the failure readable: CI now runs `pnpm lint --reporter=github`, which prints one `::error` line per finding (file, line, rule) and annotates the PR | commit `5fc536a` |
| 4 | Gitar re-analyzes and **pushes the fix itself**: the search form on the old Matches screen used `role="search"` on a `<form>`; it is now wrapped in a real `<search>` element | commit `b4cfcfa` (author: Gitar) |
| 5 | CI passes, Gitar approves, the PR merges | [run 42699325807](https://github.com/JoshTheMenace/confer/actions/runs/42699325807) |

In the same review Gitar also caught that our new `contract-first` rule would have requested changes on every route PR for code that predates the contract. We applied its wording, so the rule judges only what a PR adds or changes.

Other places Gitar changed the outcome today:

- [PR #11](https://github.com/JoshTheMenace/confer/pull/11): reviewing the API **contract** before any feature code existed, it found that free-text people search could be used to probe what other attendees wrote about themselves. Fixed with a tags-only search field.
- [PR #8](https://github.com/JoshTheMenace/confer/pull/8) and [PR #10](https://github.com/JoshTheMenace/confer/pull/10): we disagreed with an auto-applied fix twice, showed measurements, and Gitar agreed.
- [PR #4](https://github.com/JoshTheMenace/confer/pull/4): it blocked a merge because sponsors could read interests that attendees had hidden from sponsors, then fixed it.

Fix commits authored by Gitar itself (auto-apply on), all merged:

| PR | Commit | What it fixed |
|---|---|---|
| [#13](https://github.com/JoshTheMenace/confer/pull/13) | `b4cfcfa` | the accessibility lint error that failed CI, and the scope of our own `contract-first` rule |
| [#16](https://github.com/JoshTheMenace/confer/pull/16) | `8aa0b33`, `e722e3f` | interest edits and booth requests that skipped a check; consent receipts and a profile write conflict |
| [#19](https://github.com/JoshTheMenace/confer/pull/19) | `27549bd` | the consent operator read at most 10,000 shares and could write a deletion receipt twice while search lagged: it added paging and a stable receipt id, with a test |

PRs #1 to #21 each carry a Gitar review. Where we disagreed ([#8](https://github.com/JoshTheMenace/confer/pull/8), [#10](https://github.com/JoshTheMenace/confer/pull/10)), the fix was reverted with measurements and Gitar agreed.
