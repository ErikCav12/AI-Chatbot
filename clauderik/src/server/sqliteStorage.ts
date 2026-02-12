import Database from "better-sqlite3";
import Anthropic from "@anthropic-ai/sdk";
import { Conversation, MAX_MESSAGES } from "./storage.js";

// SqliteStorage implements the same Storage interface as InMemoryStorage,
// but persists data to a SQLite file on disk. This means conversations
// survive server restarts — unlike InMemoryStorage which loses everything.

export class SqliteStorage {
    // the better-sqlite3 database instance — all queries go through this
    private db: Database.Database;

    constructor(dbPath: string = "./data/chat.db") {
        // open (or create) the SQLite database file at the given path
        // passing ":memory:" creates an in-memory database (useful for tests)
        this.db = new Database(dbPath);

        // enable WAL (Write-Ahead Logging) mode for better performance
        // WAL allows concurrent reads while a write is happening,
        // which is important for a web server handling multiple requests
        this.db.pragma("journal_mode = WAL");

        // create the conversations table if it doesn't already exist
        // this stores the metadata for each conversation (id, title, timestamp)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);

        // create the messages table if it doesn't already exist
        // each message belongs to a conversation via conversation_id
        // role is either "user" or "assistant"
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);
    }

    // creates a new conversation with a unique ID and default title
    // returns the conversation object with an empty messages array
    async createConversation(): Promise<Conversation> {
        // generate a unique ID for the new conversation (same as InMemoryStorage)
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        const title = "New conversation";

        // insert a new row into the conversations table
        this.db.prepare(
            "INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)"
        ).run(id, title, createdAt);

        // return the conversation object in the same shape as the interface expects
        return {
            id,
            messages: [],
            createdAt,
            title,
        };
    }

    // looks up a conversation by its ID
    // returns the full conversation with all its messages, or null if not found
    async getConversation(conversationId: string): Promise<Conversation | null> {
        // try to find the conversation row in the database
        const row = this.db.prepare(
            "SELECT * FROM conversations WHERE id = ?"
        ).get(conversationId) as { id: string; title: string; created_at: number } | undefined;

        // if no row was found, the conversation doesn't exist
        if (!row) return null;

        // fetch all messages for this conversation, ordered by when they were created
        // this gives us the messages in chronological order (oldest first)
        const messageRows = this.db.prepare(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at"
        ).all(conversationId) as { role: string; content: string }[];

        // convert the database rows into Anthropic.MessageParam format
        // each row has a role ("user" or "assistant") and the text content
        const messages: Anthropic.MessageParam[] = messageRows.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        // build and return the full Conversation object
        return {
            id: row.id,
            messages,
            createdAt: row.created_at,
            title: row.title,
        };
    }

    // returns all conversations with their messages
    // used to populate the sidebar list in the UI
    async getConversations(): Promise<Conversation[]> {
        // fetch all conversation rows from the database
        const rows = this.db.prepare(
            "SELECT * FROM conversations"
        ).all() as { id: string; title: string; created_at: number }[];

        // for each conversation, fetch its messages and build the full object
        // we reuse getConversation() to avoid duplicating the message-fetching logic
        const conversations: Conversation[] = [];
        for (const row of rows) {
            const convo = await this.getConversation(row.id);
            // getConversation can return null, but since we just got the row
            // from the database, it should always exist — this is just a safety check
            if (convo) conversations.push(convo);
        }

        return conversations;
    }

    // adds a message to an existing conversation
    // handles auto-titling from the first user message and enforces the message cap
    // returns the updated conversation, or null if the conversation doesn't exist
    async addMessageToConversation(
        conversationId: string,
        message: Anthropic.MessageParam
    ): Promise<Conversation | null> {
        // first check if the conversation exists
        const row = this.db.prepare(
            "SELECT id, title FROM conversations WHERE id = ?"
        ).get(conversationId) as { id: string; title: string } | undefined;

        // if the conversation doesn't exist, return null (route handler will send 404)
        if (!row) return null;

        // extract the message content as a string
        // message.content can be a string or an array of content blocks (Anthropic SDK types)
        // our app only sends strings, but the type guard keeps TypeScript happy
        const content = typeof message.content === "string"
            ? message.content
            : "";

        // insert the new message into the messages table
        this.db.prepare(
            "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
        ).run(conversationId, message.role, content, Date.now());

        // auto-title: if this is a user message and the conversation still has the default title,
        // update the title to the first 50 characters of the message
        // the WHERE clause "AND title = 'New conversation'" ensures this only happens once
        if (message.role === "user") {
            this.db.prepare(
                "UPDATE conversations SET title = ? WHERE id = ? AND title = 'New conversation'"
            ).run(content.slice(0, 50), conversationId);
        }

        // enforce the MAX_MESSAGES cap — if there are too many messages,
        // delete the oldest ones to keep the conversation within the limit
        const countRow = this.db.prepare(
            "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?"
        ).get(conversationId) as { count: number };

        if (countRow.count > MAX_MESSAGES) {
            // calculate how many messages we need to remove
            const excess = countRow.count - MAX_MESSAGES;

            // delete the oldest messages by selecting the ones with the lowest created_at
            this.db.prepare(`
                DELETE FROM messages WHERE id IN (
                    SELECT id FROM messages
                    WHERE conversation_id = ?
                    ORDER BY created_at
                    LIMIT ?
                )
            `).run(conversationId, excess);
        }

        // return the full updated conversation by re-fetching it from the database
        // this ensures the returned object always reflects the current state
        return this.getConversation(conversationId);
    }

    // deletes all messages for a conversation and resets its title
    // returns true if the conversation existed, false otherwise
    async resetConversation(conversationId: string): Promise<boolean> {
        const row = this.db.prepare(
            "SELECT id FROM conversations WHERE id = ?"
        ).get(conversationId);

        if (!row) return false;

        // delete all messages belonging to this conversation
        this.db.prepare(
            "DELETE FROM messages WHERE conversation_id = ?"
        ).run(conversationId);

        // reset the title back to the default
        this.db.prepare(
            "UPDATE conversations SET title = 'New conversation' WHERE id = ?"
        ).run(conversationId);

        return true;
    }
}
