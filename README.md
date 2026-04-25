# OptiGrain SaaS

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)

Welcome to **OptiGrain SaaS**. This repository houses the complete source code for the OptiGrain platform, featuring a robust Python-based backend and a modern TypeScript frontend.

*(Briefly describe your platform here. For example: "OptiGrain is an AI-powered SaaS platform designed to optimize grain yield analytics for modern agriculture," or "OptiGrain is a data-optimization tool managing fine-grained data infrastructure.")*

---

## Key Features

* **Modern Web Interface:** A highly responsive frontend built with TypeScript.
* **Powerful API:** A scalable Python backend to handle heavy processing and logic.
* **AI Tooling Integration:** Native support for the Model Context Protocol (MCP) via `.mcp.json` for seamless AI interactions.
* **Separation of Concerns:** Clear architectural split between the `frontend` and `backend` directories.

---

## Project Structure

```text
optigrain-saas/
├── backend/                # Python backend (API, Database models, Logic)
├── frontend/               # TypeScript frontend (UI components, Views, State)
├── optigrain-context.md    # Core project context and architectural decisions
├── .mcp.json               # Model Context Protocol configuration
└── .gitignore              # Git ignore rules
