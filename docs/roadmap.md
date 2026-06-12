# Product Roadmap

This document outlines the planned evolutionary phases for Marker UI. We focus on improving the accuracy of document conversions, enhancing system flexibility, and integrating the platform into modern AI development workflows.

---

## Short-Term Roadmap

### 1. Model Context Protocol (MCP) Server Integration
- **Objective**: Develop and integrate a Model Context Protocol (MCP) server directly into Marker UI.
- **Why**: This will enable agentic LLM assistants (such as Claude Desktop, cursor, or custom AI harnesses) to interface directly with your local Marker UI instance.
- **Workflow**: Your preferred AI assistant will be able to invoke the Marker UI tool natively to convert local files, search history, and retrieve high-fidelity Markdown outputs directly into the LLM context window without manual copy-pasting.

### 2. Inline Asset & Output Preview
- Provide a side-by-side split pane in the web interface showing the input PDF and the formatted Markdown/HTML output side-by-side.
- Render extracted images inline inside the preview area.

### 3. Conversion Profiles
- Save custom parameters configurations (e.g. "Strict Layout", "Fast OCR", "LLM-Refined Table-Extract") as reusable profiles.

---

## Medium-Term Roadmap

### 1. Batch Conversion Workflows
- Allow users to upload folders or lists of documents to be processed in parallel or queued sequentially.
- Implement folder watchers that trigger conversions automatically when a new PDF is added.

### 2. Context-Aware Visual Descriptions
- Implement optional vision LLM pipelines (e.g. using local LLaVA models or cloud endpoints) to generate descriptive textual captions for extracted charts, diagrams, and screenshots, placing them directly into the Markdown.

---

## Ideas & Community Contributions

We believe the best tool development is driven by practical user needs. If you have:
- New architectural concepts or UI suggestions.
- Integration ideas for specific RAG pipelines or vector databases.
- Feedback on processing speeds or API design.

Please open a feature request in the GitHub Discussions or Issues tracker. We actively review and implement community ideas!
