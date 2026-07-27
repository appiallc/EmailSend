# Python MCP Server for Email outreach tracking

This directory contains a clean Python implementation of a Model Context Protocol (MCP) server. It connects to the Supabase PostgreSQL database and exposes tools that AI clients (like Cursor or Claude Desktop) can run to inspect and analyze email campaigns.

A local virtual environment (`venv/`) is set up to isolate dependencies.

## Structure
* `mcp_server.py`: The Python entry point running the FastMCP server.
* `requirements.txt`: Package dependencies.
* `venv/`: Virtual environment containing all required libraries locally.

## Installing / Updating Dependencies
Ensure you install inside the virtual environment:
```bash
# Windows command
./venv/Scripts/python -m pip install -r requirements.txt
```

## Configuring in Cursor
1. Open Cursor Settings (`Ctrl + Shift + J`).
2. Go to **Features** -> **MCP**.
3. Click **+ Add New MCP Server**.
4. Configure:
   * **Name**: `email-tracker`
   * **Type**: `command`
   * **Command**: 
     ```bash
     d:/Desktop/python/EmailSend/mcp-server/venv/Scripts/python d:/Desktop/python/EmailSend/mcp-server/mcp_server.py
     ```
5. Click **Save**.
