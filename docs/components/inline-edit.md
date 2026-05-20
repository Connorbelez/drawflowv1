# Inline Edit

`InlineEdit` is the text-first editor for dense product surfaces where a value should read as content until the user edits it. It is designed for milestone cards, ledgers, tables, and compact operational panels.

## Components

- `InlineEdit`: low-level string editor with formatted display content, draft value, Enter/blur commit, and Escape cancel.
- `InlineEditNumber`: numeric adapter with min/max clamping, display formatting, draft formatting, and stable prefix/suffix rendering.
- `inlineEditVariants`: CVA variants for `size`, `tone`, `affordance`, `align`, and `weight`.

## Variant Intent

- `affordance="glint"`: default. A shallow inset surface that makes editable text feel lightly pressed into the card.
- `affordance="dotted"`: quieter, useful in tables.
- `affordance="solid"`: more explicit editability.
- `affordance="none"`: use when surrounding UI already indicates edit mode.
- `size="money-lg"`: hero financial value in a card.
- `size="metric"` and `size="metric-sm"`: compact metric fields.

## Interaction Contract

- Click or keyboard activation enters edit mode.
- Enter or blur commits.
- Escape cancels and restores the committed value.
- The input is unstyled and inherits typography from the display value.
- `reserveWidth` is the stable total footprint for values that must not shift while editing. It controls the display width, inset surface width, and active editor width.
- `inputWidth` controls only the editable raw value inside that footprint. Use it with prefixes or suffixes so labels like `Day`, `$`, or `days` stay adjacent instead of stretching across a grid cell.
- Events are stopped inside the editor so parent row/card click handlers do not fire.

## Example

```tsx
<InlineEditNumber
  affordance="glint"
  ariaLabel="Milestone planned cost"
  formatDisplay={(value) => money(value)}
  min={0}
  onCommit={(amount) => updateMilestone({ amount })}
  inputWidth="6.25rem"
  prefix="$"
  reserveWidth="7.6rem"
  size="money-lg"
  value={amount}
  weight="semibold"
/>
```
