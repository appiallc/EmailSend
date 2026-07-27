import os
import sys
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

# Ensure we log to stderr so we don't corrupt the stdout JSON-RPC communication channel
logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("mcp-email-tracker")

# Load environment variables
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(project_root, ".env")
loaded = load_dotenv(dotenv_path=env_path)

logger.info(f"Debug Info:")
logger.info(f"  __file__: {__file__}")
logger.info(f"  project_root: {project_root}")
logger.info(f"  env_path: {env_path}")
logger.info(f"  .env file exists: {os.path.exists(env_path)}")
logger.info(f"  load_dotenv return value: {loaded}")

# Try DIRECT_URL first (recommended for scripts), fall back to DATABASE_URL
DB_URL = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
logger.info(f"  DATABASE_URL present: {bool(os.getenv('DATABASE_URL'))}")
logger.info(f"  DIRECT_URL present: {bool(os.getenv('DIRECT_URL'))}")

if not DB_URL:
    logger.error("No database URL connection string found in .env!")

# Create FastMCP server
mcp = FastMCP("Email Tracking Analytics")

def get_db_connection():
    if not DB_URL:
        raise ValueError("Database connection URL is missing. Please check your .env file.")
    
    # Connect to PostgreSQL database
    conn = psycopg2.connect(DB_URL)
    return conn

@mcp.tool()
def get_campaign_analytics() -> str:
    """
    Connects to the database and retrieves a list of all email outreach campaigns 
    with detailed metrics (Total Emails, Sent, Opened, Replied, Bounced, Failed).
    
    Returns:
        A formatted string summarizing the analytics for each campaign.
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # Query campaigns and aggregate status metrics from the EmailLog table
                query = """
                    SELECT 
                        c.id,
                        c.name,
                        c.status as campaign_status,
                        c.subject,
                        c."createdAt",
                        COALESCE(count(el.id), 0) as total_emails,
                        COALESCE(sum(case when el.status != 'pending' then 1 else 0 end), 0) as sent_emails,
                        COALESCE(sum(case when el.status in ('opened', 'clicked', 'replied') then 1 else 0 end), 0) as opened_emails,
                        COALESCE(sum(case when el.status = 'replied' then 1 else 0 end), 0) as replied_emails,
                        COALESCE(sum(case when el.status = 'bounced' then 1 else 0 end), 0) as bounced_emails,
                        COALESCE(sum(case when el.status = 'failed' then 1 else 0 end), 0) as failed_emails
                    FROM "Campaign" c
                    LEFT JOIN "EmailLog" el ON c.id = el."campaignId"
                    GROUP BY c.id, c.name, c.status, c.subject, c."createdAt"
                    ORDER BY c."createdAt" DESC;
                """
                cursor.execute(query)
                results = cursor.fetchall()
        finally:
            conn.close()

        if not results:
            return "No campaigns found in the database."

        # Format the output for the assistant/user to read easily
        output = ["=== Campaign outreach analytics ==="]
        for row in results:
            created_str = row["createdAt"].strftime("%Y-%m-%d %H:%M:%S") if row["createdAt"] else "Unknown"
            
            # Calculate rates
            sent = int(row["sent_emails"])
            opened = int(row["opened_emails"])
            replied = int(row["replied_emails"])
            bounced = int(row["bounced_emails"])
            total = int(row["total_emails"])
            
            open_rate = f"{(opened / sent * 100):.1f}%" if sent > 0 else "0.0%"
            reply_rate = f"{(replied / sent * 100):.1f}%" if sent > 0 else "0.0%"
            bounce_rate = f"{(bounced / sent * 100):.1f}%" if sent > 0 else "0.0%"
            
            output.append(
                f"Campaign: {row['name']} (ID: {row['id']})\n"
                f"  Subject: '{row['subject']}'\n"
                f"  Status: {row['campaign_status'].upper()} | Created: {created_str}\n"
                f"  Stats:\n"
                f"    - Total Recipients (on list): {total}\n"
                f"    - Emails Sent: {sent}\n"
                f"    - Open Rate: {open_rate} ({opened} opened)\n"
                f"    - Reply Rate: {reply_rate} ({replied} replied)\n"
                f"    - Bounce Rate: {bounce_rate} ({bounced} bounced)\n"
                f"    - Failed Transmissions: {row['failed_emails']}\n"
                f"--------------------------------------------------"
            )

        return "\n".join(output)
    
    except Exception as e:
        logger.error(f"Error fetching campaign analytics: {e}")
        return f"Error executing tool: {str(e)}"

@mcp.tool()
def get_campaign_logs(campaign_id: str, status_filter: str = None) -> str:
    """
    Retrieves individual recipient tracking logs for a specific campaign.
    
    Args:
        campaign_id: The ID of the campaign to query.
        status_filter: Optional filter to return only specific statuses (e.g. 'opened', 'replied', 'bounced', 'failed', 'sent').
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute('SELECT name FROM "Campaign" WHERE id = %s;', (campaign_id,))
                camp = cursor.fetchone()
                if not camp:
                    return f"Error: Campaign with ID '{campaign_id}' not found."
                
                campaign_name = camp["name"]
                
                sql = """
                    SELECT 
                        el.id as log_id,
                        el.type,
                        el."followUpStep",
                        el.status,
                        el."sentAt",
                        el."openedAt",
                        el."repliedAt",
                        el."bouncedAt",
                        c.email,
                        c."firstName",
                        c."lastName",
                        c.company
                    FROM "EmailLog" el
                    JOIN "Contact" c ON el."contactId" = c.id
                    WHERE el."campaignId" = %s
                """
                params = [campaign_id]
                if status_filter:
                    sql += " AND el.status = %s"
                    params.append(status_filter.lower())
                
                sql += ' ORDER BY c.email ASC, el.type DESC, el."followUpStep" ASC;'
                
                cursor.execute(sql, params)
                logs = cursor.fetchall()
        finally:
            conn.close()
            
        if not logs:
            if status_filter:
                return f"No logs found matching status '{status_filter}' for campaign '{campaign_name}'."
            return f"No email tracking logs found for campaign '{campaign_name}'."
            
        output = [f"=== Email Logs for '{campaign_name}' (Campaign ID: {campaign_id}) ==="]
        for log in logs:
            name = " ".join(filter(None, [log["firstName"], log["lastName"]])) or "No Name"
            company = f" ({log['company']})" if log["company"] else ""
            type_str = f"Follow-up {log['followUpStep']}" if log["type"] == "followup" else "Initial"
            
            log_line = (
                f"Contact: {name} <{log['email']}>{company}\n"
                f"  Type: {type_str} | Status: {log['status'].upper()}\n"
            )
            
            dates = []
            if log["sentAt"]:
                dates.append(f"Sent: {log['sentAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            if log["openedAt"]:
                dates.append(f"Opened: {log['openedAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            if log["repliedAt"]:
                dates.append(f"Replied: {log['repliedAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            if log["bouncedAt"]:
                dates.append(f"Bounced: {log['bouncedAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            
            if dates:
                log_line += f"  Timestamps: {', '.join(dates)}\n"
            
            output.append(log_line + "--------------------------------------------------")
            
        return "\n".join(output)
        
    except Exception as e:
        logger.error(f"Error fetching campaign logs: {e}")
        return f"Error executing tool: {str(e)}"

@mcp.tool()
def get_bounce_insights(campaign_id: str) -> str:
    """
    Retrieves details specifically for email deliveries that failed or bounced in a campaign.
    
    Args:
        campaign_id: The ID of the campaign to check for failures/bounces.
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute('SELECT name FROM "Campaign" WHERE id = %s;', (campaign_id,))
                camp = cursor.fetchone()
                if not camp:
                    return f"Error: Campaign with ID '{campaign_id}' not found."
                
                campaign_name = camp["name"]
                
                sql = """
                    SELECT 
                        el.id,
                        el.type,
                        el."followUpStep",
                        el.status,
                        el.error,
                        el."bouncedAt",
                        el."bounceReason",
                        el."bounceType",
                        c.email,
                        c."firstName",
                        c."lastName"
                    FROM "EmailLog" el
                    JOIN "Contact" c ON el."contactId" = c.id
                    WHERE el."campaignId" = %s AND el.status IN ('bounced', 'failed')
                    ORDER BY el.status, c.email;
                """
                cursor.execute(sql, (campaign_id,))
                logs = cursor.fetchall()
        finally:
            conn.close()
            
        if not logs:
            return f"Excellent! No bounces or transmission failures found for campaign '{campaign_name}'."
            
        output = [f"=== Deliverability & Bounce Insights for '{campaign_name}' ==="]
        for log in logs:
            name = " ".join(filter(None, [log["firstName"], log["lastName"]])) or "No Name"
            type_str = f"Follow-up {log['followUpStep']}" if log["type"] == "followup" else "Initial"
            
            output.append(
                f"Recipient: {name} <{log['email']}>\n"
                f"  Type: {type_str} | Status: {log['status'].upper()}\n"
                f"  Details:\n"
                f"    - Bounce Type: {log['bounceType'] or 'N/A'}\n"
                f"    - Bounce Reason: {log['bounceReason'] or 'N/A'}\n"
                f"    - Error Log: {log['error'] or 'N/A'}\n"
                f"    - Failure Time: {log['bouncedAt'].strftime('%Y-%m-%d %H:%M:%S') if log['bouncedAt'] else 'N/A'}\n"
                f"--------------------------------------------------"
            )
            
        return "\n".join(output)
        
    except Exception as e:
        logger.error(f"Error fetching bounce insights: {e}")
        return f"Error executing tool: {str(e)}"

@mcp.tool()
def get_contact_history(email: str) -> str:
    """
    Retrieves the entire outreach history and activity timeline across all campaigns for a single contact.
    
    Args:
        email: The email address of the contact to query.
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT c.id, c."firstName", c."lastName", c.company, c.title, cl.name as list_name
                    FROM "Contact" c
                    JOIN "ContactList" cl ON c."contactListId" = cl.id
                    WHERE LOWER(c.email) = LOWER(%s);
                """, (email.strip(),))
                contacts = cursor.fetchall()
                
                if not contacts:
                    return f"No contact with email '{email}' found in database."
                
                sql = """
                    SELECT 
                        el.id as log_id,
                        el.type,
                        el."followUpStep",
                        el.status,
                        el."sentAt",
                        el."openedAt",
                        el."repliedAt",
                        el."bouncedAt",
                        el.error,
                        camp.name as campaign_name,
                        camp.subject as campaign_subject
                    FROM "EmailLog" el
                    JOIN "Contact" c ON el."contactId" = c.id
                    JOIN "Campaign" camp ON el."campaignId" = camp.id
                    WHERE LOWER(c.email) = LOWER(%s)
                    ORDER BY el."sentAt" DESC;
                """
                cursor.execute(sql, (email.strip(),))
                logs = cursor.fetchall()
        finally:
            conn.close()
            
        c_info = contacts[0]
        name = " ".join(filter(None, [c_info["firstName"], c_info["lastName"]])) or "No Name"
        company = f", Company: {c_info['company']}" if c_info["company"] else ""
        title = f", Title: {c_info['title']}" if c_info["title"] else ""
        
        output = [
            f"=== Contact Profile ===",
            f"Name: {name} <{email}>",
            f"List membership: '{c_info['list_name']}'{company}{title}",
            f"=======================",
            ""
        ]
        
        if not logs:
            output.append("No email outreach attempts recorded for this contact yet.")
            return "\n".join(output)
            
        output.append(f"Recorded Outreach Efforts ({len(logs)}):")
        for log in logs:
            type_str = f"Follow-up {log['followUpStep']}" if log["type"] == "followup" else "Initial"
            dates = []
            if log["sentAt"]:
                dates.append(f"Sent: {log['sentAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            if log["openedAt"]:
                dates.append(f"Opened: {log['openedAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            if log["repliedAt"]:
                dates.append(f"Replied: {log['repliedAt'].strftime('%Y-%m-%d %H:%M:%S')}")
            if log["bouncedAt"]:
                dates.append(f"Bounced/Failed: {log['bouncedAt'].strftime('%Y-%m-%d %H:%M:%S')}")
                
            dates_str = f"\n    Timestamps: {', '.join(dates)}" if dates else ""
            error_str = f"\n    Error Details: {log['error']}" if log["error"] else ""
            
            output.append(
                f"- Campaign: '{log['campaign_name']}'\n"
                f"    Subject: '{log['campaign_subject']}'\n"
                f"    Step: {type_str} | Status: {log['status'].upper()}{dates_str}{error_str}\n"
                f"  ------------------------------------------------"
            )
            
        return "\n".join(output)
        
    except Exception as e:
        logger.error(f"Error fetching contact history: {e}")
        return f"Error executing tool: {str(e)}"

@mcp.tool()
def get_outreach_performance() -> str:
    """
    Aggregates performance statistics across all campaigns, comparing metrics (Open/Reply rates) 
    between Initial Outreach and successive Follow-Up steps.
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                query = """
                    SELECT 
                        type,
                        "followUpStep",
                        COUNT(id) as total_emails,
                        SUM(case when status != 'pending' then 1 else 0 end) as sent_emails,
                        SUM(case when status in ('opened', 'clicked', 'replied') then 1 else 0 end) as opened_emails,
                        SUM(case when status = 'replied' then 1 else 0 end) as replied_emails,
                        SUM(case when status = 'bounced' then 1 else 0 end) as bounced_emails
                    FROM "EmailLog"
                    GROUP BY type, "followUpStep"
                    ORDER BY type DESC, "followUpStep" ASC;
                """
                cursor.execute(query)
                results = cursor.fetchall()
        finally:
            conn.close()
            
        if not results or sum(int(r["sent_emails"]) for r in results) == 0:
            return "No emails have been processed or sent yet."
            
        output = [
            "=== Outreach Performance Breakdown (Type / Sequence Step) ===",
            "This table helps identify which steps in your sequence have the highest engagement:",
            ""
        ]
        
        for row in results:
            sent = int(row["sent_emails"])
            opened = int(row["opened_emails"])
            replied = int(row["replied_emails"])
            bounced = int(row["bounced_emails"])
            
            if row["type"] == "initial":
                label = "Initial Outreach"
            else:
                label = f"Follow-up Step {row['followUpStep']}"
                
            open_rate = f"{(opened / sent * 100):.1f}%" if sent > 0 else "0.0%"
            reply_rate = f"{(replied / sent * 100):.1f}%" if sent > 0 else "0.0%"
            bounce_rate = f"{(bounced / sent * 100):.1f}%" if sent > 0 else "0.0%"
            
            output.append(
                f"{label}:\n"
                f"  Processed/Sent: {sent} (Total on list: {row['total_emails']})\n"
                f"  Open Rate: {open_rate} ({opened} opens)\n"
                f"  Reply Rate: {reply_rate} ({replied} replies)\n"
                f"  Bounce Rate: {bounce_rate} ({bounced} bounces)\n"
                f"  --------------------------------------------------"
            )
            
        return "\n".join(output)
        
    except Exception as e:
        logger.error(f"Error fetching performance stats: {e}")
        return f"Error executing tool: {str(e)}"

if __name__ == "__main__":
    port_env = os.getenv("PORT")
    if port_env:
        logger.info(f"Starting MCP server on port {port_env} using sse transport...")
        mcp.run(transport="sse", host="0.0.0.0", port=int(port_env))
    else:
        logger.info("Starting MCP server using stdio transport...")
        mcp.run()
