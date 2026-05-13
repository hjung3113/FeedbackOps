# Use a WYSIWYG-first rich content editor

FeedbackOps receives VOC from internal users who are not necessarily developers, and past VOC input needs include screenshots, pasted content, formatted explanation, and sometimes tables. We prioritize an intuitive WYSIWYG editing experience over Markdown-first or raw HTML input; Markdown or JSON may be used internally, but users must be able to write rich VOC descriptions, replies, public updates, and internal comments without knowing markup syntax.

Tiptap and Plate are the primary spike candidates because they are actively maintained OSS React-friendly editor frameworks with image support and optional table support. Toast UI Editor remains a prototype comparison candidate because its feature fit is strong, but its maintenance signal is weaker for long-lived core product infrastructure.

The MVP bar is one shared WYSIWYG foundation, VOC description editing, constrained rich-content surfaces for Reporter Reply, Public Update, and Internal Comment, inline image paste/drop/upload with attachment-backed storage, read-only rendering, and safe rendering/storage. Rich Table support, Excel range conversion, complex per-surface toolbar policy, and mobile rich editing polish are spike-gated and should not block the first MVP slice.
