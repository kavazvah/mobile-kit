# Design rubric

Score each variant **1–5** per criterion with a one-line justification that points at something visible in the screenshots or the code.

| # | Criterion | Weight | 5 looks like | 1 looks like |
|---|---|---|---|---|
| 1 | Clarity of the primary action | ×2 | One obvious action, reachable by thumb, labelled with a verb | Competing actions or the main one below the fold on `small-360` |
| 2 | Visual hierarchy | ×2 | Scan order matches importance; clear grouping and spacing rhythm | Everything has equal weight; dense or scattered |
| 3 | Consistency with tokens and existing screens | ×1 | Only tokens; matches components and patterns of existing screens | Raw values; new one-off patterns |
| 4 | Platform fit (iOS/Android) | ×1 | Native conventions on both (navigation, controls, feedback) | Fights one platform's conventions |
| 5 | Fit at 360dp and at 2.0× font | ×2 | Nothing clipped or overlapping; scrolls where needed | Clipped text, broken rows, hidden actions |
| 6 | Accessibility | ×1 | Targets ≥ 48dp, contrast ≥ 4.5:1 text, labels/roles present | Small targets, low contrast, unlabelled icons |
| 7 | Multi-locale robustness | ×1 | Survives 30–40% longer strings and other scripts; no text in images | Fixed-width text boxes, concatenated strings |
| 8 | Implementation cost and complexity | ×1 | Existing components, little new state, easy to maintain | New native deps, complex animation/state for little gain |

**Weighted total** = sum(score × weight); maximum 55. Criteria 1, 2 and 5 count double. **Ties go to the variant with the better (higher) score on criterion 8**, i.e. the lower implementation cost.

A variant scoring **1 on criterion 1, 5 or 6** is not shippable as is, whatever its total. If every variant has such a blocker, or the best total is below 33 (60%), the critic should say "none is good enough" and explain what a better variant would need.
