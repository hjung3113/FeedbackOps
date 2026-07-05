# FeedbackOps Visual Reference

This file is the raw visual token seed for FeedbackOps. It is not the product
design source of truth and does not define frontend component behavior.
Use `docs/frontend/README.md` and `docs/frontend/ui-design-system.md` for
implementation-facing UI contracts.

Reference inspiration: Samsung One UI.

> Samsung Light Operations: A bright, layered interface anchored by Samsung-blue accents, like a calm enterprise console.

**Theme:** light

FeedbackOps presents a focused light-mode experience, inspired by Samsung's enterprise design language. A soft porcelain base creates a calm, open canvas, while subtle layered surfaces build depth without harsh contrasts. Distinctive muted text colors (#687386 for secondary, #98a2b3 for tertiary) maintain readability against the light backdrop. Critically, interaction is marked by a single Samsung blue (#1428a0), applied selectively to primary calls to action, preventing visual clutter and guiding the user's eye with precision.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Pitch Black | `#f3f7fe` | `--color-pitch-black` | Page background, primary surface for base elements, subtly integrated into shadows for depth. |
| Graphite | `#fbfdff` | `--color-graphite` | Elevated card backgrounds, slightly lighter than the canvas to denote layering. |
| Deep Slate | `#edf3fb` | `--color-deep-slate` | Secondary elevated card backgrounds, providing another layer of visual hierarchy. |
| Charcoal Grey | `#cbd6e6` | `--color-charcoal-grey` | Borders and some shadowed card surfaces, framing elements with a subtle distinction. |
| Muted Ash | `#b8c4d6` | `--color-muted-ash` | Subtle borders and dividers, indicating soft separations within the light theme. |
| Gunmetal | `#94a3b8` | `--color-gunmetal` | Tertiary background elements and input borders, a darker neutral for functional elements. |
| Porcelain | `#101828` | `--color-porcelain` | Primary text and icons, providing strong contrast for readability against light backgrounds. |
| Light Steel | `#374151` | `--color-light-steel` | Secondary text and borders, for less prominent information or structural lines. |
| Storm Cloud | `#687386` | `--color-storm-cloud` | Tertiary text, descriptive labels, and inactive states, recedes into the background for low-priority details. |
| Fog Grey | `#98a2b3` | `--color-fog-grey` | Muted text for metadata, timestamps, and further de-emphasized content. |
| Alabaster | `#e5e5e6` | `--color-alabaster` | Informational borders and subtle fills, often seen in code blocks or explanatory components. |
| Neon Lime | `#1428a0` | `--color-neon-lime` | Primary action indicators, active states, and focus elements — a high-energy focal point. |
| Aether Blue | `#1428a0` | `--color-aether-blue` | Decorative highlights and occasional background elements, suggesting a technological or informational context. |
| Forest Green | `#008d4c` | `--color-forest-green` | Positive status indicators, success messages, and related iconography. |
| Cyan Spark | `#00a9e0` | `--color-cyan-spark` | Informational highlights and unique icon fills, providing a cool accent. |
| Emerald | `#18a86b` | `--color-emerald` | Success and completion states, often paired with green text. |
| Warning Red | `#d92d3a` | `--color-warning-red` | Observed in icon fill, body borderColor, other fill. Extracted usage does not support a distinct primary control color. |
| Deep Violet | `#3157d5` | `--color-deep-violet` | Background accents in specific content blocks, indicating a distinct informational category. |
| Amethyst | `#6a8dff` | `--color-amethyst` | Another variant of violet for backgrounds, used interchangeably with Deep Violet for visual diversity. |

### Managed System Identity Tokens

| Name | Value | Token | Role |
|------|-------|-------|------|
| Tableau Scope | `#5e6ad2` | `--managed-system-tableau` | Compact `TB` scope mark background. |
| Power BI Scope | `#f2c46d` | `--managed-system-power-bi` | Compact `PB` scope mark background. |
| Looker Scope | `#02b8cc` | `--managed-system-looker` | Compact `LK` scope mark background. |
| Metabase Scope | `#27a644` | `--managed-system-metabase` | Compact `MB` scope mark background. |
| Default Scope | `#1428a0` | `--managed-system-default` | Fallback compact Managed System mark background. |

## Tokens — Typography

### Inter Variable — Primary UI typeface for all content including headings, body text, and interactive elements. Its variable weights provide a clean, modern aesthetic with strong technical readability. · `--font-inter-variable`
- **Substitute:** Inter
- **Weights:** 300, 400, 510, 590
- **Sizes:** 10px, 11px, 12px, 13px, 14px, 15px, 16px, 17px, 20px, 24px, 32px, 48px, 64px, 72px
- **Line height:** 1.00, 1.13, 1.20, 1.33, 1.40, 1.47, 1.50, 1.60, 2.00, 2.46, 2.75
- **Letter spacing:** -0.22, -0.15, -0.13, -0.12, -0.11, -0.1
- **OpenType features:** `"cv01", "ss03"`
- **Role:** Primary UI typeface for all content including headings, body text, and interactive elements. Its variable weights provide a clean, modern aesthetic with strong technical readability.

### Berkeley Mono — Monospaced font for code snippets, technical details, and certain data displays, ensuring consistent character alignment and technical clarity. · `--font-berkeley-mono`
- **Substitute:** IBM Plex Mono
- **Weights:** 400
- **Sizes:** 12px, 13px, 14px
- **Line height:** 1.30, 1.40, 1.50, 1.71
- **Letter spacing:** -0.15
- **Role:** Monospaced font for code snippets, technical details, and certain data displays, ensuring consistent character alignment and technical clarity.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 10px | 1.4 | -0.1px | `--text-caption` |
| body | 14px | 1.4 | -0.13px | `--text-body` |
| heading | 24px | 1.33 | -0.22px | `--text-heading` |
| heading-lg | 48px | 1.2 | -0.22px | `--text-heading-lg` |
| display | 72px | 1 | -0.22px | `--text-display` |

### Panel Title Block Scale (PR #59)

`PanelTitleBlock` ships two title-scale variants via the `size` prop:

- **Compact (`size='lg'`, default):** `text-lg font-semibold tracking-tight` — 17px / weight 600. Used on all surfaces except the VOC detail/triage hero blocks. Preserves the V1b "document" axis density.
- **Hero (`size='xl'`, opt-in):** `text-xl font-bold tracking-tight` — 20px / weight 700. Used by `IdentitySection` (VOC Inbox Detail) and `TriagePanel` (Triage overview), per `.review/title-reference.png` reference image. Opt in explicitly; default does not change for existing consumers.

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** compact

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 36 | 36px | `--spacing-36` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 56 | 56px | `--spacing-56` |
| 64 | 64px | `--spacing-64` |
| 80 | 80px | `--spacing-80` |
| 96 | 96px | `--spacing-96` |
| 128 | 128px | `--spacing-128` |

### Border Radius

| Element | Value |
|---------|-------|
| pill | 9999px |
| tags | 2px |
| cards | 6px |
| badges | 4px |
| inputs | 6px |
| buttons | 6px |
| default | 6px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| sm | `rgba(16, 24, 40, 0.06) 0px 2px 4px 0px` | `--shadow-sm` |
| md | `rgba(20, 40, 160, 0.06) 0px 0px 12px 0px inset` | `--shadow-md` |
| subtle | `rgb(213, 224, 244) 0px 0px 0px 1px inset` | `--shadow-subtle` |
| subtle-2 | `rgba(20, 40, 160, 0.10) 0px 0px 0px 1px` | `--shadow-subtle-2` |
| subtle-3 | `rgba(20, 40, 160, 0.01) 0px 5px 2px 0px, rgba(20, 40, 160, 0.04) ...` | `--shadow-subtle-3` |
| xl | `rgba(20, 40, 160, 0.12) 0px 12px 36px 0px` | `--shadow-xl` |
| subtle-4 | `rgba(20, 40, 160, 0.10) 0px 0px 0px 2px` | `--shadow-subtle-4` |
| subtle-5 | `rgba(20, 40, 160, 0.20) 0px 0px 0px 1px` | `--shadow-subtle-5` |
| subtle-6 | `rgba(20, 40, 160, 0.03) 0px 0px 0px 1px inset, rgba(20, 40, 160, 0.04) ...` | `--shadow-subtle-6` |

### Layout

- **Section gap:** 24px
- **Card padding:** 12px
- **Element gap:** 8px
- **Entity link inventory object rows:** headerless 4-column object-row grid (`--entity-link-object-row-grid`: checkbox, id, body, trailing), 64px id stem (`--entity-link-object-id-min-width`), and default 60px row rhythm (`--row-height-default`) to mirror the integration-links prototype density.

## Components

### Primary Action Button
**Role:** Call to action button

Filled button with 'Neon Lime' background (#1428a0), 'Porcelain' text (#101828) inverted to white on accent, 6px border-radius, and variable padding. Used for primary user actions.

### Ghost Navigation Button
**Role:** Navigation and secondary actions

Ghost button with transparent background, 'Porcelain' text (#101828), no explicit padding, and 0px border-radius. Navigational links or simple interactive elements.

### Subtle Link Button
**Role:** Tertiary actions and links

Ghost button with transparent background, 'Light Steel' text (#374151), 6px border-radius, and minimal padding (0px top/bottom, 6px left/right). Used for less prominent interactive elements or textual links.

### Navigation Item Button
**Role:** Sidebar navigation items

Ghost button with transparent background, 'Storm Cloud' text (#687386), 2px border-radius, and no explicit padding. Used for items in a navigation list.

### Default Card
**Role:** Content container

Card with 'Graphite' background (#fbfdff), 6px border-radius, and an outer shadow of rgba(16, 24, 40, 0.06) 0px 2px 4px 0px. Padding is 8px on all sides.

### Elevated Card
**Role:** Prominent content container

Card with 'Deep Slate' background (#edf3fb), 12px top border-radius (0px bottom), and an inset shadow of rgb(213, 224, 244) 0px 0px 0px 1px. Padding is 24px vertical and 0px horizontal.

### Nested Card
**Role:** Internal content grouping

Card with 'Pitch Black' background (#f3f7fe) and 12px border-radius, no shadow. Padding 8px on all sides, used for containing sub-elements within larger cards.

### Body Card
**Role:** Rich body content container inside detail panels (introduced PR #59)

Card using 'Deep Slate' background (`bg-surface-card-elevated`, `#edf3fb`), 6px border-radius (`rounded-md`), 16px padding (`p-4`). Preceded by an uppercase English section label `BODY` styled `text-xs font-semibold uppercase tracking-wide text-text-muted mb-2`. Body text inside uses `text-sm text-text-secondary leading-relaxed`. `RichContentRenderer` renders the TipTap content inside the card; empty state shows `'설명 없음'` with `text-text-muted`. Canonical implementation: `DescriptionSection` in `apps/frontend/src/features/voc/components/detail/`. Used on both VOC Inbox Detail and Triage Panel overview sections.

### Input Field
**Role:** User input fields

Input field with transparent background, 'Porcelain' text (#101828), 'Charcoal Grey' border (#cbd6e6), and 6px border-radius. Padding is 12px vertical and 14px horizontal.

### Subtle Input Field
**Role:** Search or secondary input fields

Input field with 'Gunmetal' background (#94a3b8), 'Porcelain' text (#101828), no explicit border, and 0px border-radius. Used for less emphasized data entry.

### Badge
**Role:** Label or tag

Badge with a 'Gunmetal' background (#94a3b8), 'Storm Cloud' text (#687386), 4px border-radius, and padding of 0px vertical and 6px horizontal. Used for small categorical labels.

## Do's and Don'ts

### Do
- Use 'Pitch Black' (#f3f7fe) for the primary page background to establish the light theme.
- Apply 'Porcelain' (#101828) for all primary text and important icons to ensure readability.
- Highlight primary interactive elements exclusively with 'Neon Lime' (#1428a0) as a background, restricting its use to guide user attention.
- Create depth and hierarchy by layering surfaces using 'Pitch Black' (#f3f7fe), 'Graphite' (#fbfdff), and 'Deep Slate' (#edf3fb) backgrounds.
- Employ the Inter Variable font family with specific letter-spacing adjustments for all UI text, such as -0.22px for display sizes and -0.11px for body text, to maintain a tight, precise feel.
- Utilize 6px border-radius for all primary buttons, cards, and input fields to maintain a consistent, subtly rounded aesthetic.
- Use 'Storm Cloud' (#687386) for secondary text and descriptive labels to recede into the background.

### Don't
- Do not introduce additional bright or saturated colors beyond 'Neon Lime' (#1428a0) for interactive elements; maintain its singular role.
- Avoid using deep black backgrounds or dark-themed patterns, as the system is anchored in a light mode aesthetic.
- Do not deviate from the specified typeface choices; 'Inter Variable' and 'Berkeley Mono' are fundamental to the visual identity.
- Refrain from using strong, diffuse shadows; elevation is achieved through subtle layering and sharp, contained shadows like rgba(16, 24, 40, 0.06) 0px 2px 4px 0px.
- Do not apply broad, decorative background gradients across large sections of the UI; gradients are subtle and contained to specific functional areas.
- Do not use generic border-radii; adhere to 6px for key components like cards and buttons, and 2px for smaller tags, to preserve the signature balance of softness and precision.
- Avoid large amounts of white space; the design is compact, leveraging an 8px element gap as a standard measurement.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Pitch Black Canvas | `#f3f7fe` | Base page background and deepest surface level. |
| 1 | Graphite Card | `#fbfdff` | Primary card surface for general content, slightly elevated from the canvas. |
| 2 | Deep Slate Elevated Card | `#edf3fb` | More prominent card surface, used for focused content sections or lists. |
| 3 | Charcoal Grey Overlay | `#cbd6e6` | Accent surface for borders, shadows, and subtle overlays, providing clear separation. |

## Elevation

- **Default Card:** `rgba(16, 24, 40, 0.06) 0px 2px 4px 0px`
- **Sidebar/Menu Element Focus:** `rgba(20, 40, 160, 0.06) 0px 0px 12px 0px inset`
- **Elevated Card Inset:** `rgb(213, 224, 244) 0px 0px 0px 1px inset`
- **Card Border/Input Focus:** `rgba(20, 40, 160, 0.10) 0px 0px 0px 1px`
- **Navigation/Button Subtle Lift:** `rgba(20, 40, 160, 0.01) 0px 5px 2px 0px, rgba(20, 40, 160, 0.04) 0px 3px 2px 0px, rgba(20, 40, 160, 0.07) 0px 1px 1px 0px, rgba(20, 40, 160, 0.08) 0px 0px 1px 0px`

## Imagery

The site's visual language is dominated by UI elements and product screenshots, emphasizing functionality over decorative imagery. Where images appear, they are often contained within realistic product mockups or embedded application frames. Abstract graphics are minimal, primarily serving as subtle background textures or data visualizations. Icons are filled, minimalist, and mono-color, often adopting the 'Porcelain' (#101828) or 'Storm Cloud' (#687386) neutral palette, enhancing the dashboard aesthetic. The overall density of imagery is low; it serves an explanatory or product showcase role rather than a decorative one.

## Layout

The page primarily uses a full-bleed structure for background content, with main content sections constrained by a centered maximum width (not explicitly defined but visually present). The hero section features a full-bleed 'Pitch Black' background with a centered, prominent headline. Subsequent sections alternate between light backgrounds for narrative content and embedded UI examples, often featuring split layouts (text on one side, product UI on the other). Content is generally arranged in vertical stacks or multi-column grids for feature display. Navigation consists of a sticky top bar and frequently observed left-hand sidebar for application-like structures. Spacing is compact yet deliberate, creating a dense but organized information flow.

## Agent Prompt Guide

Quick Color Reference:
- text: #101828 (Porcelain)
- background: #f3f7fe (Pitch Black)
- border: #cbd6e6 (Charcoal Grey)
- accent: #1428a0 (Aether Blue)
- primary action: #1428a0 (filled action)

3-5 Example Component Prompts:
- Create a call-to-action button: 'Neon Lime' background (#1428a0), white text (#ffffff), Inter Variable font weight 590 at 15px, 6px border-radius, 12px vertical and 24px horizontal padding.
- Create a default card with content: 'Graphite' background (#fbfdff), 6px border-radius, rgba(16, 24, 40, 0.06) 0px 2px 4px 0px shadow. Inside, use Inter Variable font weight 400 at 14px with 'Porcelain' text (#101828), and a subsection headline at 17px weight 510 with 'Porcelain' text (#101828). Apply 8px padding internally.
- Create a sidebar navigation item: Ghost button with transparent background, 'Storm Cloud' text (#687386), Inter Variable font weight 400 at 14px, 2px border-radius, no padding.
- Create an input field: transparent background with a 'Gunmetal' fill (#94a3b8), 'Light Steel' text (#374151) using Inter Variable font weight 400 at 14px, 6px border-radius. Inset with a 1px 'Charcoal Grey' border (#cbd6e6). Padding 12px vertical and 14px horizontal.

## Similar Brands

- **Samsung One UI** — Light enterprise UI with strong Samsung-blue accents, calm porcelain canvas, and Korean enterprise typography rhythm.
- **Linear (light variant)** — Layered light surfaces creating depth, clear typography, and a subdued palette for a productivity application.
- **Notion (light mode)** — Layered light surfaces creating depth, clear typography, and a subdued palette for a productivity application.
- **Raycast (light theme)** — High-contrast light mode, minimalist design, and an emphasis on technical tools with clear interaction points.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-pitch-black: #f3f7fe;
  --color-graphite: #fbfdff;
  --color-deep-slate: #edf3fb;
  --color-charcoal-grey: #cbd6e6;
  --color-muted-ash: #b8c4d6;
  --color-gunmetal: #94a3b8;
  --color-porcelain: #101828;
  --color-light-steel: #374151;
  --color-storm-cloud: #687386;
  --color-fog-grey: #98a2b3;
  --color-alabaster: #e5e5e6;
  --color-neon-lime: #1428a0;
  --color-aether-blue: #1428a0;
  --color-forest-green: #008d4c;
  --color-cyan-spark: #00a9e0;
  --color-emerald: #18a86b;
  --color-warning-red: #d92d3a;
  --color-deep-violet: #3157d5;
  --color-amethyst: #6a8dff;

  /* Typography — Font Families */
  --font-inter-variable: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-berkeley-mono: 'Berkeley Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-caption: 10px;
  --leading-caption: 1.4;
  --tracking-caption: -0.1px;
  --text-body: 14px;
  --leading-body: 1.4;
  --tracking-body: -0.13px;
  --text-heading: 24px;
  --leading-heading: 1.33;
  --tracking-heading: -0.22px;
  --text-heading-lg: 48px;
  --leading-heading-lg: 1.2;
  --tracking-heading-lg: -0.22px;
  --text-display: 72px;
  --leading-display: 1;
  --tracking-display: -0.22px;

  /* Typography — Weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-w510: 510;
  --font-weight-w590: 590;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-128: 128px;

  /* Layout */
  --section-gap: 24px;
  --card-padding: 12px;
  --element-gap: 8px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 22px;
  --radius-full: 400px;
  --radius-full-2: 9999px;

  /* Named Radii */
  --radius-pill: 9999px;
  --radius-tags: 2px;
  --radius-cards: 6px;
  --radius-badges: 4px;
  --radius-inputs: 6px;
  --radius-buttons: 6px;
  --radius-default: 6px;

  /* Shadows */
  --shadow-sm: rgba(16, 24, 40, 0.06) 0px 2px 4px 0px;
  --shadow-md: rgba(20, 40, 160, 0.06) 0px 0px 12px 0px inset;
  --shadow-subtle: rgb(213, 224, 244) 0px 0px 0px 1px inset;
  --shadow-subtle-2: rgba(20, 40, 160, 0.10) 0px 0px 0px 1px;
  --shadow-subtle-3: rgba(20, 40, 160, 0.01) 0px 5px 2px 0px, rgba(20, 40, 160, 0.04) 0px 3px 2px 0px, rgba(20, 40, 160, 0.07) 0px 1px 1px 0px, rgba(20, 40, 160, 0.08) 0px 0px 1px 0px;
  --shadow-xl: rgba(20, 40, 160, 0.12) 0px 12px 36px 0px;
  --shadow-subtle-4: rgba(20, 40, 160, 0.10) 0px 0px 0px 2px;
  --shadow-subtle-5: rgba(20, 40, 160, 0.20) 0px 0px 0px 1px;
  --shadow-subtle-6: rgba(20, 40, 160, 0.03) 0px 0px 0px 1px inset, rgba(20, 40, 160, 0.04) 0px 1px 0px 0px inset, rgba(20, 40, 160, 0.30) 0px 0px 0px 1px, rgba(20, 40, 160, 0.10) 0px 4px 4px 0px;

  /* Surfaces */
  --surface-pitch-black-canvas: #f3f7fe;
  --surface-graphite-card: #fbfdff;
  --surface-deep-slate-elevated-card: #edf3fb;
  --surface-charcoal-grey-overlay: #cbd6e6;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-pitch-black: #f3f7fe;
  --color-graphite: #fbfdff;
  --color-deep-slate: #edf3fb;
  --color-charcoal-grey: #cbd6e6;
  --color-muted-ash: #b8c4d6;
  --color-gunmetal: #94a3b8;
  --color-porcelain: #101828;
  --color-light-steel: #374151;
  --color-storm-cloud: #687386;
  --color-fog-grey: #98a2b3;
  --color-alabaster: #e5e5e6;
  --color-neon-lime: #1428a0;
  --color-aether-blue: #1428a0;
  --color-forest-green: #008d4c;
  --color-cyan-spark: #00a9e0;
  --color-emerald: #18a86b;
  --color-warning-red: #d92d3a;
  --color-deep-violet: #3157d5;
  --color-amethyst: #6a8dff;

  /* Typography */
  --font-inter-variable: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-berkeley-mono: 'Berkeley Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-caption: 10px;
  --leading-caption: 1.4;
  --tracking-caption: -0.1px;
  --text-body: 14px;
  --leading-body: 1.4;
  --tracking-body: -0.13px;
  --text-heading: 24px;
  --leading-heading: 1.33;
  --tracking-heading: -0.22px;
  --text-heading-lg: 48px;
  --leading-heading-lg: 1.2;
  --tracking-heading-lg: -0.22px;
  --text-display: 72px;
  --leading-display: 1;
  --tracking-display: -0.22px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;
  --spacing-128: 128px;

  /* Border Radius */
  --radius-sm: 2px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-2xl-2: 22px;
  --radius-full: 400px;
  --radius-full-2: 9999px;

  /* Shadows */
  --shadow-sm: rgba(16, 24, 40, 0.06) 0px 2px 4px 0px;
  --shadow-md: rgba(20, 40, 160, 0.06) 0px 0px 12px 0px inset;
  --shadow-subtle: rgb(213, 224, 244) 0px 0px 0px 1px inset;
  --shadow-subtle-2: rgba(20, 40, 160, 0.10) 0px 0px 0px 1px;
  --shadow-subtle-3: rgba(20, 40, 160, 0.01) 0px 5px 2px 0px, rgba(20, 40, 160, 0.04) 0px 3px 2px 0px, rgba(20, 40, 160, 0.07) 0px 1px 1px 0px, rgba(20, 40, 160, 0.08) 0px 0px 1px 0px;
  --shadow-xl: rgba(20, 40, 160, 0.12) 0px 12px 36px 0px;
  --shadow-subtle-4: rgba(20, 40, 160, 0.10) 0px 0px 0px 2px;
  --shadow-subtle-5: rgba(20, 40, 160, 0.20) 0px 0px 0px 1px;
  --shadow-subtle-6: rgba(20, 40, 160, 0.03) 0px 0px 0px 1px inset, rgba(20, 40, 160, 0.04) 0px 1px 0px 0px inset, rgba(20, 40, 160, 0.30) 0px 0px 0px 1px, rgba(20, 40, 160, 0.10) 0px 4px 4px 0px;
}
```
