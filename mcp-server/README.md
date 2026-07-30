# Python MCP Server for Email outreach tracking

This directory contains a clean Python implementation of a Model Context Protocol (MCP) server. It connects to the Supabase PostgreSQL database and exposes tools that AI clients (like Cursor or Claude Desktop) can run to inspect and analyze email campaigns.

A local virtual environment (`venv/`) is set up to isolate dependencies.

## Structure
* `mcp_server.py`: The Python entry point running the FastMCP server.
* `requirements.txt`: Package dependencies.
* `venv/`: Virtual environment containing all required libraries locally.

## Tools exposed
* `get_campaign_analytics` — per-campaign sent/open/reply/bounce/fail counts
* `get_campaign_logs` — recipient-level logs (optional status filter)
* `get_bounce_insights` — failed/bounced details for a campaign
* `get_contact_history` — full timeline for one email across campaigns
* `get_outreach_performance` — initial vs follow-up step performance

## Installing / Updating Dependencies
```bash
# Windows (from mcp-server/)
.\venv\Scripts\python -m pip install -r requirements.txt
```

If `venv` does not exist yet:
```bash
python -m venv venv
.\venv\Scripts\python -m pip install -r requirements.txt
```

Uses `DIRECT_URL` or `DATABASE_URL` from the project root `.env`.

## Configuring in Cursor

Project config is already in [`.cursor/mcp.json`](../.cursor/mcp.json). Reload MCP (or restart Cursor) after first setup.

Manual / global config (Cursor Settings → MCP → Add server):
* **Name**: `email-tracker`
* **Type**: `command`
* **Command**:
  ```text
  C:\Users\jayka\Desktop\crm\mcp-server\venv\Scripts\python.exe
  ```
* **Args**:
  ```text
  C:\Users\jayka\Desktop\crm\mcp-server\mcp_server.py
  ```

## Smoke test (stdio)
```bash
.\venv\Scripts\python mcp_server.py
```
(Leave running only if testing by hand; Cursor starts it automatically when the MCP is enabled.)
