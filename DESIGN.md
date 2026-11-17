# Design system — Cart total calculator

A single-purpose, neutral-page calculator. One accent colour, high text contrast, mobile-first layout.

## Tokens

```json
{
  "colors": {
    "background": "#f7f8fa",
    "surface": "#ffffff",
    "text": "#1a1d23",
    "muted": "#5b6270",
    "accent": "#2f5fd0",
    "accent-contrast": "#ffffff",
    "border": "#d5d9e0",
    "danger": "#b42318",
    "success": "#1a7f4b"
  },
  "spacing": { "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px" },
  "radius": { "sm": "6px", "md": "10px" },
  "typography": { "family": "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", "body": "16px", "h1": "28px", "small": "14px" }
}
```

## Rules

- One primary action per screen, styled with the accent colour; secondary actions are outlined.
- Every input has a visible label; error text uses the danger colour and is announced to screen readers.
- Touch targets are at least 44px high. Focus states are always visible.
- Text contrast meets WCAG AA. Layout works from 320px wide up; content max-width 480px, centred.
