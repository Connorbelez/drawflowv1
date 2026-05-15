# Animated Curved Timeline

Reusable horizontal roadmap timeline for construction draw planning surfaces.

## Core Data

```ts
type TimelineItem<TData = unknown> = {
  id: string;
  x: number;
  label?: string;
  markerLabel?: string;
  lane?: number;
  tone?: "active" | "blocked" | "complete" | "upcoming" | "warning";
  disabled?: boolean;
  data?: TData;
};
```

`x` is expressed in the unit supplied through `range`.

```tsx
<AnimatedCurvedTimeline
  items={items}
  range={{ min: 0, max: 270, unit: "days" }}
  pixelsPerUnit={6.4}
  minNodeSpacingPx={198}
/>
```

## Composition

The component owns timeline geometry, SVG routing, progress animation, scroll overflow, and insertion math. Consumers own rendering:

- `activeItemId` / `onActiveItemChange` for controlled selected node state.
- `progressValue` / `onProgressValueChange` for externally managed progress-fill position on the x-axis.
- `hoverValue` / `onHoverValueChange` for externally managed hover probe state.
- `hoverNodeCollisionPaddingPx` to control the distance-weighted fade zone around rendered nodes/icons. The dot hides quickly near icon centers while the label stays visible.
- `renderNode` for progress nodes; call `context.activate()` from custom node controls.
- `renderCard` for cards that hang below the route.
- `renderMarker` for markers above the route.
- `formatValue` for x-axis labels.
- `straightLine` to switch the rail between curved node-lane routing and a perfectly straight horizontal path.

Right-click insertion is configured with `insertion.createItem`. When the insert menu is confirmed, `insertTimelineItemWithSpacing` inserts the node and shifts later nodes by `insertion.minGap` when needed. If spacing pushes nodes beyond the current range, the returned range expands so the x-axis remains scrollable.

The pure utilities in `animated-curved-timeline-utils.ts` cover layout, path generation, progress mapping, value rounding, and insertion spacing.

The rendered path is measured with the browser SVG geometry API so hover markers, marker connector lines, and progress fills resolve against the actual curved/straight SVG route. Pointer movement is throttled to animation frames and writes to Motion Values, avoiding React re-renders during high-frequency hover motion.
