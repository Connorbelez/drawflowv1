# Production Proposal Gantt Workspace

The production proposal Gantt workspace adapts the existing build workspace
Gantt surface to the current DrawFlow proposal domain. It is available on:

- `/builder/proposals/$proposalId?tab=gantt`
- `/backoffice/proposals/$planId?tab=gantt`

Live build routes already expose the active-build Gantt tab for both personas:

- `/builder/builds/$buildId?tab=gantt`
- `/backoffice/builds/$buildId?tab=gantt`

## Domain Mapping

The original Gantt model grouped milestones under explicit draw groups. The
production proposal model instead treats draw availability as unlocked by
milestone completion. To bridge those models, the adapter derives draw groups
from the ordered milestone and sub-milestone rows between draw availability
boundaries.

For example, if the proposal order is:

```text
m1.1, m1.2, m1.3, m1.4, m2.1, m2.2, m2.3, D1, m3.1, m3.2, D2
```

Then the Gantt receives:

```text
Draw group 1: m1.1, m1.2, m1.3, m1.4, m2.1, m2.2, m2.3
Draw group 2: m3.1, m3.2
```

Draws with a `milestoneKey` are treated as the boundary after that milestone.
When a draw lacks a milestone key, `timingDay` is used as the fallback boundary.
Any trailing milestone work after the final explicit draw is represented by a
derived trailing draw group so the Gantt never silently drops roadmap scope.

## Persistence And Synchronization

`ProductionProposalTimelineGanttWorkspace` converts a
`ConvexTimelineWorkspace` into Gantt draft state and persists edits through the
same production proposal mutations used by the timeline tab:

- milestone create/update/delete
- draw create/update/delete
- proposal submission

Because both tabs read the same Convex timeline workspace and write through the
same mutations, edits made in the Gantt are reflected in the timeline after the
query refreshes, and timeline edits are reflected in the Gantt through the same
workspace input.

Draft proposal editing uses the same Gantt adapter in local state. Saving the
draft writes normalized milestone and draw rows so the submitted/review proposal
surfaces keep the same roadmap and draw availability semantics.
