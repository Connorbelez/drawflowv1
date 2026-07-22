# Animated Curved Timeline

Reusable horizontal roadmap timeline for construction draw planning surfaces.

## Core Data

```ts
type TimelineItem<TData = unknown> = {
  id: string;
  x: number;
  // Optional completion/end x-value is supplied through getItemEndValue.
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
- `minNodeSpacingPx` to set the rendered spacing floor. The layout expands the x-axis scale to preserve positive `x` deltas before falling back to shifting same-date or clamped nodes.
- `hoverNodeCollisionPaddingPx` to control the distance-weighted fade zone around rendered nodes/icons. The dot hides quickly near icon centers while the label stays visible.
- `renderNode` for progress nodes; call `context.activate()` from custom node controls.
- `getItemEndValue` with `renderEndNode` for inline completion markers on the same lane as a start node. End nodes do not create path waypoints, connectors, or cards; they are rendered as collision-aware node wrappers with the id suffix `-end`.
- Selecting the start node of an item with `getItemEndValue` fills the progress rail through that item's completion marker. Items without an end value still fill to their start node.
- `activeItemPhase` to distinguish selected start and completion markers for the same item. It can be controlled by the consumer; when omitted, the component manages start/end phase internally. `renderNode` receives `phase: "start"`, `renderEndNode` receives `phase: "end"`, and `renderCard` receives the active phase while remaining active for either selected phase of the item.
- `renderCard` for cards that hang below the route.
- `renderMarker` for markers above the route.
- `markerStackProximityPx` to cluster markers that would visually overlap into a stacked card group without adding vertical route height.
- `focusedMarkerId` to promote a specific marker to the top of its stack when parent state opens an editor or selection.
- `formatValue` for x-axis labels.
- `straightLine` to switch the rail between curved node-lane routing and a perfectly straight horizontal path.

Inline completion nodes share the main range scale with start nodes. `minInlineNodeSpacingPx` sets the spacing floor between start and completion markers, while `minNodeSpacingPx` continues to protect card-bearing start nodes from overlap. When needed, the layout expands horizontally before shifting clamped or same-date coordinates.

Marker stacks group by rendered pixel proximity rather than rounded day equality, then fan connector lines back to each marker's true timeline position. The stacked footprint stays within the original marker lane so the cashflow charts can remain above the fold.

Right-click insertion is configured with `insertion.createItem`. When the insert menu is confirmed, `insertTimelineItemWithSpacing` inserts the node and shifts later nodes by `insertion.minGap` when needed. If spacing pushes nodes beyond the current range, the returned range expands so the x-axis remains scrollable.

The pure utilities in `animated-curved-timeline-utils.ts` cover layout, path generation, progress mapping, value rounding, and insertion spacing.

The rendered path is measured with the browser SVG geometry API so hover markers, marker connector lines, and progress fills resolve against the actual curved/straight SVG route. Pointer movement is throttled to animation frames and writes to Motion Values, avoiding React re-renders during high-frequency hover motion.
