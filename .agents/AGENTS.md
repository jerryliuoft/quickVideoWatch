# Agent Preferences

- Always build the project after implementation to ensure it builds correctly and is ready for testing.
- Never commit code unless explicitly stated.
- Never push code unless explicitly stated.

## UX and Color Scheme Guidelines

Based on the SilenceRemover design, the plugin should follow these visual aesthetics:
- **General Theme**: Clean, light theme utilizing a standard Tailwind color palette (`bg-white` and `bg-slate-50` for backgrounds).
- **Text & Typography**: Use `text-gray-900` for primary headings/text and `text-gray-600` for secondary text or descriptions.
- **Accents & Primary Actions**: Use `blue-600` (e.g., `bg-blue-600`, `text-blue-600`, `hover:bg-blue-500`) and `sky-600` for call-to-actions, primary buttons, and highlighted text.
- **Components & Panels**: Use `bg-white shadow-lg rounded-md` for floating panels or container elements to give them depth and clear separation.
- **Media Players**: Video/media player containers should use `bg-black shadow-lg` to create high contrast.
- **Interactive Elements**: Emphasize hover effects with scale and color transitions (e.g., `transition-all duration-200`, `bg-gray-300 hover:bg-blue-400` for resize handles or sliders).
- **Secondary Elements**: Footers or dark sections should use `bg-gray-800` with muted `text-gray-400`.
