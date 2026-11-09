---
title: Consent changes need tests
description: Any change to who-sees-what must ship with a test.
when: PRs that change consent logic, envelope visibility, mutual-catch unlocking, or request expiry
actions: Request changes asking for a test that proves the new visibility rule
type: check
---

Who can see which envelope is the core of this product. If a PR changes that logic,
it must add or update a vitest test showing both an allowed and a denied case.
