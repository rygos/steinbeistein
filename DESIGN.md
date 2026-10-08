## 0. Research Log

- Embedded references: shortlisted Airbnb (image-led consumer cards), Pinterest (image-first grids), and Apple (quiet, high-clarity product surfaces). Chose a collector-specific blend of Apple spacing and Pinterest image prioritization; no brand assets or copy are reused.
- Lazyweb: skipped because a useful LEGO collection-management reference could not be established from local reference material; the brief itself defines the workflow.
- Imagen concepts: skipped; a product-screen bitmap would not add value over implementing live, responsive controls and real inventory data.
- Spatial pattern: app shell with persistent desktop navigation, document scrolling on compact screens, and a constrained content column.

## 1. Direction

A calm collector's workbench: warm paper surfaces, deep ink, and a small LEGO-red action color. Set photography and part imagery carry the color; the interface stays quiet so physical objects are easy to recognize.

## 2. Color tokens

- `--canvas`: #f5f4f0, warm page background.
- `--surface`: #ffffff, cards and controls.
- `--surface-muted`: #eeede8, secondary surfaces.
- `--ink`: #20211f, primary text.
- `--ink-soft`: #777973, secondary text.
- `--line`: #e5e4df, dividers.
- `--accent`: #d92f2f, primary action and progress.
- `--success`: #287654, complete state.
- Dark mode uses deep charcoal canvas/surfaces, light ink, and the same semantic accents with sufficient contrast.

## 3. Typography

System sans stack, `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, to keep the deployment self-contained. Display 32/38 semibold, section 22/28 semibold, body 14/21 regular, metadata 12/16 medium, numeric 20/24 semibold. Monospaced set and part identifiers use the platform monospace stack.

## 4. Spacing and shape

Base unit 4px. Spacing tokens: 4, 8, 12, 16, 24, 32, 40, 48. Card radius 16px, controls 10px, pill radius 999px. Content maximum width 1440px; responsive grids use minimum 260px cards.

## 5. Primitives and states

- App shell: desktop side rail plus top utility row; compact layouts use a scrollable document and bottom navigation.
- Set card: image-led, quiet surface, progress track, complete badge; hover lifts subtly, focus uses a visible outline.
- Button: primary, secondary, quiet, and destructive variants; hover, pressed, focus-visible, disabled states.
- Search/filter controls: labeled inputs and compact select controls with visible focus and clear empty states.
- Inventory row: fixed image well, clickable part preview, part identity, quantity controls, found state; suitable for virtualization/pagination at the API boundary.
- Part image preview: keyboard-focusable thumbnail buttons open the shared native modal dialog with contain-fit artwork, caption, visible close control, Escape dismissal, and a dimmed backdrop.
- Global missing-parts list: grouped by part and color, with a compact labeled selector for color, part number, or total missing quantity.
- Set artwork: constrained image frame in the overview; activation opens the shared image dialog with contain-fit artwork and the same dismissal behavior.
- Feedback: inline loading, success and error messages; no blocking dialog for common quantity changes.

## 6. Motion

120–180ms ease-out opacity/transform transitions for hover and feedback. No animated layout sizing. Respect `prefers-reduced-motion` by removing transitions.

## 7. Depth and materials

Layer surfaces with warm canvas contrast, fine neutral dividers, and restrained low-opacity shadows on lifted cards. No glass effects or colored state borders.

## 8. Accessibility and accepted debt

Semantic landmarks, labels, keyboard-operable controls, visible focus, descriptive image alt text, and status text accompany color. External Rebrickable image URLs are displayed directly and may be unavailable; component fallbacks preserve layout. Interface translations start in German.
